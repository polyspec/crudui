// Package main provides a Go HTTP API server for form validation.
//
// This example demonstrates:
// - Loading form specs from YAML files
// - Validating form data using the validator package
// - RESTful API design for form validation
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

	"github.com/example/form-generator/validator/validator"
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

// ValidateRequest is the request body for POST /validate
type ValidateRequest struct {
	Spec map[string]interface{} `json:"spec"`
	Data map[string]interface{} `json:"data"`
}

// ValidateFieldRequest is the request body for single field validation
type ValidateFieldRequest struct {
	Path  string                 `json:"path"`
	Value interface{}            `json:"value"`
	Data  map[string]interface{} `json:"data"`
}

// APIResponse is the standard API response format
type APIResponse struct {
	Success    bool                   `json:"success"`
	Message    string                 `json:"message,omitempty"`
	Error      string                 `json:"error,omitempty"`
	Errors     []ValidationErrorDTO   `json:"errors,omitempty"`
	ErrorCount int                    `json:"errorCount,omitempty"`
	Data       map[string]interface{} `json:"data,omitempty"`
	Spec       map[string]interface{} `json:"spec,omitempty"`
	Forms      []string               `json:"forms,omitempty"`
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

// writeJSON writes a JSON response
func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

// writeError writes an error response
func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, APIResponse{
		Success: false,
		Error:   message,
	})
}

// writeSuccess writes a success response
func writeSuccess(w http.ResponseWriter, resp APIResponse) {
	resp.Success = true
	writeJSON(w, http.StatusOK, resp)
}

// handleValidate handles POST /validate
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
		writeError(w, http.StatusBadRequest, "Missing required field: spec")
		return
	}

	if req.Data == nil {
		writeError(w, http.StatusBadRequest, "Missing required field: data")
		return
	}

	// Convert and validate
	spec := convertToValidatorSpec(req.Spec)
	v := validator.NewValidator(spec)
	result := v.Validate(req.Data)

	if result.IsValid {
		writeSuccess(w, APIResponse{
			Message: "Validation passed",
		})
	} else {
		errors := make([]ValidationErrorDTO, len(result.Errors))
		for i, err := range result.Errors {
			errors[i] = ValidationErrorDTO{
				Field:   err.Field,
				Rule:    err.Rule,
				Message: err.Message,
			}
		}
		writeJSON(w, http.StatusUnprocessableEntity, APIResponse{
			Success:    false,
			Errors:     errors,
			ErrorCount: len(errors),
		})
	}
}

// handleListForms handles GET /forms
func (s *Server) handleListForms(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	entries, err := os.ReadDir(s.config.SpecsDir)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Error listing forms: "+err.Error())
		return
	}

	var forms []string
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		name := entry.Name()
		if strings.HasSuffix(name, ".yaml") || strings.HasSuffix(name, ".yml") {
			formName := strings.TrimSuffix(strings.TrimSuffix(name, ".yaml"), ".yml")
			forms = append(forms, formName)
		}
	}

	writeSuccess(w, APIResponse{
		Forms: forms,
	})
}

// handleGetForm handles GET /form/{name}
func (s *Server) handleGetForm(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	// Extract form name from path
	name := strings.TrimPrefix(r.URL.Path, "/form/")
	if name == "" {
		writeError(w, http.StatusBadRequest, "Form name is required")
		return
	}

	cached, err := s.loadSpec(name)
	if err != nil {
		writeError(w, http.StatusNotFound, "Form spec not found: "+name)
		return
	}

	writeSuccess(w, APIResponse{
		Spec: cached.Raw,
	})
}

// handleSubmit handles POST /submit/{name}
func (s *Server) handleSubmit(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	// Extract form name from path
	name := strings.TrimPrefix(r.URL.Path, "/submit/")
	if name == "" {
		writeError(w, http.StatusBadRequest, "Form name is required")
		return
	}

	// Load spec
	cached, err := s.loadSpec(name)
	if err != nil {
		writeError(w, http.StatusNotFound, "Form spec not found: "+name)
		return
	}

	// Parse request body
	var data map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&data); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid JSON: "+err.Error())
		return
	}

	// Validate
	result := cached.Validator.Validate(data)

	if !result.IsValid {
		errors := make([]ValidationErrorDTO, len(result.Errors))
		for i, err := range result.Errors {
			errors[i] = ValidationErrorDTO{
				Field:   err.Field,
				Rule:    err.Rule,
				Message: err.Message,
			}
		}
		writeJSON(w, http.StatusUnprocessableEntity, APIResponse{
			Success:    false,
			Errors:     errors,
			ErrorCount: len(errors),
		})
		return
	}

	// Log successful submission
	log.Printf("Form \"%s\" submitted successfully: %+v\n", name, data)

	writeSuccess(w, APIResponse{
		Message: "Form submitted successfully",
		Data:    data,
	})
}

// handleValidateField handles POST /validate-field/{name}
func (s *Server) handleValidateField(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	// Extract form name from path
	name := strings.TrimPrefix(r.URL.Path, "/validate-field/")
	if name == "" {
		writeError(w, http.StatusBadRequest, "Form name is required")
		return
	}

	// Load spec
	cached, err := s.loadSpec(name)
	if err != nil {
		writeError(w, http.StatusNotFound, "Form spec not found: "+name)
		return
	}

	// Parse request
	var req ValidateFieldRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid JSON: "+err.Error())
		return
	}

	if req.Path == "" {
		writeError(w, http.StatusBadRequest, "Missing required field: path")
		return
	}

	// Provide empty data if not supplied
	if req.Data == nil {
		req.Data = make(map[string]interface{})
	}

	// Validate single field
	errMsg := cached.Validator.ValidateField(req.Path, req.Value, req.Data)

	if errMsg != nil {
		writeJSON(w, http.StatusUnprocessableEntity, map[string]interface{}{
			"success": false,
			"field":   req.Path,
			"error":   *errMsg,
		})
		return
	}

	writeSuccess(w, APIResponse{
		Message: "Field is valid",
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
	path := r.URL.Path

	// Route requests
	switch {
	case path == "/validate" && r.Method == http.MethodPost:
		s.handleValidate(w, r)
	case path == "/forms" && r.Method == http.MethodGet:
		s.handleListForms(w, r)
	case strings.HasPrefix(path, "/form/"):
		s.handleGetForm(w, r)
	case strings.HasPrefix(path, "/submit/"):
		s.handleSubmit(w, r)
	case strings.HasPrefix(path, "/validate-field/"):
		s.handleValidateField(w, r)
	case path == "/health":
		s.handleHealth(w, r)
	default:
		writeError(w, http.StatusNotFound, "Endpoint not found")
	}
}

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
	fmt.Println("  GET  /forms              - List all form specs")
	fmt.Println("  GET  /form/:name         - Get form spec by name")
	fmt.Println("  POST /validate           - Validate data against spec")
	fmt.Println("  POST /submit/:name       - Validate and submit form")
	fmt.Println("  POST /validate-field/:name - Validate single field")
	fmt.Println("  GET  /health             - Health check")

	addr := ":" + config.Port
	if err := http.ListenAndServe(addr, server); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}
