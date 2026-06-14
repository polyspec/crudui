// Package main provides a Go HTTP API server for form validation.
//
// This example demonstrates:
// - Loading form specs from YAML files
// - Validating form data using the validator package
// - RESTful API design for form validation
//
// Canonical API contract (shared by node-api / php-api / go-api):
//
//	GET  /api/specs        -> 200 {"specs": ["contact", ...]}
//	GET  /api/specs/{name} -> 200 {"name": "...", "spec": {...}} | 404 {"error": "..."}
//	POST /api/validate     -> body {"spec": {...}, "data": {...}}
//	                          always 200 {"valid": bool, "errors": [{"field","rule","message"}]}
//	Server errors only use 4xx/5xx with {"error": "..."}.
//	CORS: Access-Control-Allow-Origin * + OPTIONS preflight.
package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"gopkg.in/yaml.v3"

	"github.com/polyspec/polyspec/packages/validator-go/validator"
)

// Config holds server configuration
type Config struct {
	Port     string
	SpecsDir string
}

// Server is the HTTP server for form validation
type Server struct {
	config    Config
	specCache map[string]*CachedSpec
	cacheMux  sync.RWMutex
}

// CachedSpec holds a parsed spec and its validator
type CachedSpec struct {
	Raw       map[string]interface{}
	Spec      validator.Spec
	Validator *validator.Validator
}

// ValidateRequest is the request body for POST /api/validate
type ValidateRequest struct {
	Spec map[string]interface{} `json:"spec"`
	Data map[string]interface{} `json:"data"`
}

// SpecsResponse is the response for GET /api/specs
type SpecsResponse struct {
	Specs []string `json:"specs"`
}

// SpecResponse is the response for GET /api/specs/{name}
type SpecResponse struct {
	Name string                 `json:"name"`
	Spec map[string]interface{} `json:"spec"`
}

// ValidateResponse is the response for POST /api/validate
type ValidateResponse struct {
	Valid  bool                 `json:"valid"`
	Errors []ValidationErrorDTO `json:"errors"`
}

// ErrorResponse is the error envelope for 4xx/5xx responses
type ErrorResponse struct {
	Error string `json:"error"`
}

// ValidationErrorDTO is the API representation of a validation error
type ValidationErrorDTO struct {
	Field   string `json:"field"`
	Rule    string `json:"rule"`
	Message string `json:"message"`
}

// NewServer creates a new Server instance
func NewServer(config Config) *Server {
	return &Server{
		config:    config,
		specCache: make(map[string]*CachedSpec),
	}
}

// loadSpec loads a spec from YAML file
func (s *Server) loadSpec(name string) (*CachedSpec, error) {
	// Check cache first
	s.cacheMux.RLock()
	if cached, ok := s.specCache[name]; ok {
		s.cacheMux.RUnlock()
		return cached, nil
	}
	s.cacheMux.RUnlock()

	// Try .yaml and .yml extensions
	var filePath string
	yamlPath := filepath.Join(s.config.SpecsDir, name+".yaml")
	ymlPath := filepath.Join(s.config.SpecsDir, name+".yml")

	if _, err := os.Stat(yamlPath); err == nil {
		filePath = yamlPath
	} else if _, err := os.Stat(ymlPath); err == nil {
		filePath = ymlPath
	} else {
		return nil, fmt.Errorf("spec not found: %s", name)
	}

	// Read and parse YAML
	content, err := os.ReadFile(filePath)
	if err != nil {
		return nil, fmt.Errorf("failed to read spec: %w", err)
	}

	var raw map[string]interface{}
	if err := yaml.Unmarshal(content, &raw); err != nil {
		return nil, fmt.Errorf("failed to parse YAML: %w", err)
	}

	// Convert to validator spec
	spec := convertToValidatorSpec(raw)
	v := validator.NewValidator(spec)

	cached := &CachedSpec{
		Raw:       raw,
		Spec:      spec,
		Validator: v,
	}

	// Cache it
	s.cacheMux.Lock()
	s.specCache[name] = cached
	s.cacheMux.Unlock()

	return cached, nil
}

// isValidSpecShape reports whether a raw spec has the canonical polyspec
// shape: a group whose `properties` is an object. Anything else (arbitrary
// keys, a missing `properties`, a non-group type) is malformed and is rejected
// with 400 instead of being passed to the validator.
func isValidSpecShape(raw map[string]interface{}) bool {
	if raw == nil {
		return false
	}
	if t, ok := raw["type"].(string); !ok || t != "group" {
		return false
	}
	_, ok := raw["properties"].(map[string]interface{})
	return ok
}

// convertToValidatorSpec converts a raw YAML spec to validator.Spec
func convertToValidatorSpec(raw map[string]interface{}) validator.Spec {
	spec := validator.Spec{
		Fields: []validator.Field{},
		Rules:  make(map[string]validator.Rule),
	}

	// Check if it's a group type with properties
	if specType, ok := raw["type"].(string); ok && specType == "group" {
		if props, ok := raw["properties"].(map[string]interface{}); ok {
			for name, fieldSpec := range props {
				if fs, ok := fieldSpec.(map[string]interface{}); ok {
					spec.Fields = append(spec.Fields, convertField(name, fs))
				}
			}
		}
	}

	// Extract custom rules if present
	if rules, ok := raw["rules"].(map[string]interface{}); ok {
		for name, ruleSpec := range rules {
			if rs, ok := ruleSpec.(map[string]interface{}); ok {
				spec.Rules[name] = convertRule(rs)
			}
		}
	}

	return spec
}

// convertField converts a raw field spec to validator.Field
func convertField(name string, raw map[string]interface{}) validator.Field {
	field := validator.Field{
		Name: name,
	}

	if t, ok := raw["type"].(string); ok {
		field.Type = t
	}

	if label, ok := raw["label"].(string); ok {
		field.Label = label
	}

	// Handle required field
	if req, ok := raw["required"]; ok {
		field.Required = req
	}

	// Handle rules
	if rules, ok := raw["rules"].(map[string]interface{}); ok {
		field.Rules = rules
	}

	// Handle messages
	if msgs, ok := raw["messages"].(map[string]interface{}); ok {
		field.Messages = make(map[string]string)
		for k, v := range msgs {
			if msg, ok := v.(string); ok {
				field.Messages[k] = msg
			}
		}
	}

	// Handle nested properties
	if props, ok := raw["properties"].(map[string]interface{}); ok {
		for propName, propSpec := range props {
			if ps, ok := propSpec.(map[string]interface{}); ok {
				field.Fields = append(field.Fields, convertField(propName, ps))
			}
		}
	}

	// Handle multiple
	if multiple, ok := raw["multiple"].(bool); ok {
		field.Multiple = multiple
	}

	return field
}

// convertRule converts a raw rule spec to validator.Rule
func convertRule(raw map[string]interface{}) validator.Rule {
	rule := validator.Rule{}

	if pattern, ok := raw["pattern"].(string); ok {
		rule.Pattern = pattern
	}

	if min, ok := raw["min"].(int); ok {
		rule.Min = &min
	}

	if max, ok := raw["max"].(int); ok {
		rule.Max = &max
	}

	if msg, ok := raw["message"].(string); ok {
		rule.Message = msg
	}

	return rule
}

// toWireErrors maps validator errors to the canonical wire format
func toWireErrors(errs []validator.ValidationError) []ValidationErrorDTO {
	wire := make([]ValidationErrorDTO, len(errs))
	for i, err := range errs {
		wire[i] = ValidationErrorDTO{
			Field:   err.Field,
			Rule:    err.Rule,
			Message: err.Message,
		}
	}
	return wire
}

// writeJSON writes a JSON response
func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

// writeError writes an error response
func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, ErrorResponse{Error: message})
}

// handleValidate handles POST /api/validate
//
// Validation failure is NOT an HTTP error: always 200 with {valid, errors}.
func (s *Server) handleValidate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	var req ValidateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid JSON: "+err.Error())
		return
	}

	if req.Spec == nil {
		writeError(w, http.StatusBadRequest, "Missing or invalid field: spec")
		return
	}

	// A valid form spec is a group with a properties object. Reject any other
	// shape with 400 instead of returning a misleading valid:true. Keeps the
	// three backends aligned: malformed specs are a client error.
	if !isValidSpecShape(req.Spec) {
		writeError(w, http.StatusBadRequest, "Invalid spec: expected a group with a properties object")
		return
	}

	if req.Data == nil {
		writeError(w, http.StatusBadRequest, "Missing or invalid field: data")
		return
	}

	// Convert and validate
	spec := convertToValidatorSpec(req.Spec)
	v := validator.NewValidator(spec)
	result := v.Validate(req.Data)

	writeJSON(w, http.StatusOK, ValidateResponse{
		Valid:  result.IsValid,
		Errors: toWireErrors(result.Errors),
	})
}

// handleListSpecs handles GET /api/specs
func (s *Server) handleListSpecs(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	entries, err := os.ReadDir(s.config.SpecsDir)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Error listing specs: "+err.Error())
		return
	}

	specs := []string{}
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		name := entry.Name()
		if strings.HasSuffix(name, ".yaml") || strings.HasSuffix(name, ".yml") {
			specName := strings.TrimSuffix(strings.TrimSuffix(name, ".yaml"), ".yml")
			specs = append(specs, specName)
		}
	}

	writeJSON(w, http.StatusOK, SpecsResponse{Specs: specs})
}

// handleGetSpec handles GET /api/specs/{name}
func (s *Server) handleGetSpec(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	// Extract spec name from path
	name := strings.TrimPrefix(r.URL.Path, "/api/specs/")
	if name == "" {
		writeError(w, http.StatusBadRequest, "Spec name is required")
		return
	}

	cached, err := s.loadSpec(name)
	if err != nil {
		writeError(w, http.StatusNotFound, "Spec not found: "+name)
		return
	}

	writeJSON(w, http.StatusOK, SpecResponse{
		Name: name,
		Spec: cached.Raw,
	})
}

// handleHealth handles GET /health
func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{
		"status": "ok",
	})
}

// ServeHTTP implements http.Handler
func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	// CORS: allow all origins, answer OPTIONS preflight
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	path := r.URL.Path

	// Route requests
	switch {
	case path == "/api/validate":
		s.handleValidate(w, r)
	case path == "/api/specs":
		s.handleListSpecs(w, r)
	case strings.HasPrefix(path, "/api/specs/"):
		s.handleGetSpec(w, r)
	case path == "/health":
		s.handleHealth(w, r)
	default:
		writeError(w, http.StatusNotFound, "Endpoint not found")
	}
}

// main resolves Config from the PORT / SPECS_DIR environment (with sensible
// defaults), constructs the Server, logs the served endpoints, and blocks in
// http.ListenAndServe until the process exits or the listen call fails.
func main() {
	// Get configuration from environment or use defaults
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	specsDir := os.Getenv("SPECS_DIR")
	if specsDir == "" {
		// Default to specs directory relative to binary
		execPath, _ := os.Executable()
		specsDir = filepath.Join(filepath.Dir(execPath), "specs")

		// If running with go run, use current directory
		if _, err := os.Stat(specsDir); os.IsNotExist(err) {
			specsDir = "./specs"
		}
	}

	config := Config{
		Port:     port,
		SpecsDir: specsDir,
	}

	server := NewServer(config)

	fmt.Printf("Form Validator API server running on port %s\n", config.Port)
	fmt.Printf("Specs directory: %s\n", config.SpecsDir)
	fmt.Println()
	fmt.Println("Available endpoints:")
	fmt.Println("  GET  /api/specs        - List all form specs")
	fmt.Println("  GET  /api/specs/:name  - Get form spec by name")
	fmt.Println("  POST /api/validate     - Validate data against spec")
	fmt.Println("  GET  /health           - Health check")

	addr := ":" + config.Port
	if err := http.ListenAndServe(addr, server); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}
