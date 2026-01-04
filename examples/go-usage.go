// Go Validation Example
//
// This example demonstrates how to use the form-generator validator
// in Go applications for server-side validation.

package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"regexp"
	"strings"

	validator "github.com/limepie/form-generator/validator/go/validator"
	"gopkg.in/yaml.v3"
)

// =============================================================================
// Basic Usage
// =============================================================================

// basicExample demonstrates basic validation
func basicExample() {
	fmt.Println("=== Basic Validation Example ===")

	// Define the form specification
	spec := validator.Spec{
		Fields: []validator.Field{
			{
				Name:  "email",
				Type:  "email",
				Label: "Email",
				Rules: map[string]interface{}{
					"required": true,
					"email":    true,
				},
				Messages: map[string]string{
					"required": "Email is required.",
					"email":    "Please enter a valid email address.",
				},
			},
			{
				Name:  "password",
				Type:  "password",
				Label: "Password",
				Rules: map[string]interface{}{
					"required":  true,
					"minlength": 8,
				},
				Messages: map[string]string{
					"required":  "Password is required.",
					"minlength": "Password must be at least 8 characters.",
				},
			},
		},
	}

	// Create validator instance
	v := validator.NewValidator(spec)

	// Validate data - invalid case
	invalidData := map[string]interface{}{
		"email":    "invalid-email",
		"password": "123",
	}

	result := v.Validate(invalidData)

	fmt.Printf("Data: %+v\n", invalidData)
	fmt.Printf("Is Valid: %v\n", result.IsValid)
	fmt.Printf("Errors: %+v\n\n", result.Errors)

	// Validate data - valid case
	validData := map[string]interface{}{
		"email":    "user@example.com",
		"password": "SecurePass123",
	}

	result = v.Validate(validData)

	fmt.Printf("Data: %+v\n", validData)
	fmt.Printf("Is Valid: %v\n", result.IsValid)
	fmt.Printf("Errors: %+v\n\n", result.Errors)
}

// =============================================================================
// Loading Spec from YAML File
// =============================================================================

// yamlFileExample loads and validates using YAML spec file
func yamlFileExample() {
	fmt.Println("=== YAML File Validation Example ===")

	// Load spec from YAML file
	specPath := "./basic-form.yml"
	specFile, err := os.ReadFile(specPath)
	if err != nil {
		fmt.Printf("Failed to read YAML file: %v\n", err)
		return
	}

	var spec validator.Spec
	if err := yaml.Unmarshal(specFile, &spec); err != nil {
		fmt.Printf("Failed to parse YAML: %v\n", err)
		return
	}

	// Create validator
	v := validator.NewValidator(spec)

	// Test data - valid
	validData := map[string]interface{}{
		"personal": map[string]interface{}{
			"name":  "John Doe",
			"email": "john@example.com",
			"phone": "010-1234-5678",
		},
		"account": map[string]interface{}{
			"username": "johndoe123",
			"password": "SecurePass123",
		},
		"newsletter": "1",
		"terms":      true,
	}

	result := v.Validate(validData)
	fmt.Printf("Valid data result: IsValid=%v, Errors=%+v\n", result.IsValid, result.Errors)

	// Test data - invalid
	invalidData := map[string]interface{}{
		"personal": map[string]interface{}{
			"name":  "J",       // Too short
			"email": "invalid", // Invalid email
			"phone": "12345",   // Invalid format
		},
		"account": map[string]interface{}{
			"username": "jo",    // Too short
			"password": "short", // Too short
		},
		"newsletter": "1",
		"terms":      false,
	}

	result = v.Validate(invalidData)
	fmt.Printf("Invalid data result: IsValid=%v, Errors=%+v\n\n", result.IsValid, result.Errors)
}

// =============================================================================
// Conditional Required Validation
// =============================================================================

// conditionalRequiredExample demonstrates conditional required field validation
func conditionalRequiredExample() {
	fmt.Println("=== Conditional Required Example ===")

	spec := validator.Spec{
		Fields: []validator.Field{
			{
				Name: "delivery_type",
				Type: "choice",
				Rules: map[string]interface{}{
					"required": true,
				},
			},
			{
				Name:  "address",
				Type:  "group",
				Label: "Address",
				Fields: []validator.Field{
					{
						Name: "street",
						Type: "text",
						Rules: map[string]interface{}{
							// Conditional required using expression
							"required": "..delivery_type != 3",
						},
						Messages: map[string]string{
							"required": "Street address is required for delivery.",
						},
					},
					{
						Name: "city",
						Type: "text",
						Rules: map[string]interface{}{
							"required": "..delivery_type != 3",
						},
					},
					{
						Name: "postal_code",
						Type: "text",
						Rules: map[string]interface{}{
							"required": "..delivery_type != 3",
						},
					},
				},
			},
			{
				Name: "pickup_location",
				Type: "select",
				Rules: map[string]interface{}{
					"required": ".delivery_type == 3",
				},
				Messages: map[string]string{
					"required": "Please select a pickup location.",
				},
			},
		},
	}

	v := validator.NewValidator(spec)

	// Test case 1: Standard delivery without address (should fail)
	deliveryNoAddress := map[string]interface{}{
		"delivery_type":   "1",
		"address":         map[string]interface{}{},
		"pickup_location": "",
	}

	// Test case 2: Standard delivery with address (should pass)
	deliveryWithAddress := map[string]interface{}{
		"delivery_type": "1",
		"address": map[string]interface{}{
			"street":      "123 Main St",
			"city":        "Seoul",
			"postal_code": "12345",
		},
		"pickup_location": "",
	}

	// Test case 3: Pickup with location (should pass)
	pickupWithLocation := map[string]interface{}{
		"delivery_type":   "3",
		"address":         map[string]interface{}{},
		"pickup_location": "store1",
	}

	fmt.Printf("Delivery without address: IsValid=%v\n", v.Validate(deliveryNoAddress).IsValid)
	fmt.Printf("Delivery with address: IsValid=%v\n", v.Validate(deliveryWithAddress).IsValid)
	fmt.Printf("Pickup with location: IsValid=%v\n\n", v.Validate(pickupWithLocation).IsValid)
}

// =============================================================================
// Nested Groups and Arrays
// =============================================================================

// nestedGroupsExample demonstrates nested groups and array validation
func nestedGroupsExample() {
	fmt.Println("=== Nested Groups Example ===")

	spec := validator.Spec{
		Fields: []validator.Field{
			{
				Name:  "company",
				Type:  "group",
				Label: "Company",
				Fields: []validator.Field{
					{
						Name: "name",
						Type: "text",
						Rules: map[string]interface{}{
							"required":  true,
							"maxlength": 100,
						},
					},
					{
						Name:  "address",
						Type:  "group",
						Label: "Address",
						Fields: []validator.Field{
							{
								Name: "street",
								Type: "text",
								Rules: map[string]interface{}{
									"required": true,
								},
							},
							{
								Name: "city",
								Type: "text",
								Rules: map[string]interface{}{
									"required": true,
								},
							},
							{
								Name: "country",
								Type: "select",
								Rules: map[string]interface{}{
									"required": true,
								},
							},
						},
					},
				},
			},
			{
				Name:     "employees",
				Type:     "group",
				Label:    "Employees",
				Multiple: true,
				Fields: []validator.Field{
					{
						Name: "name",
						Type: "text",
						Rules: map[string]interface{}{
							"required": true,
						},
					},
					{
						Name: "email",
						Type: "email",
						Rules: map[string]interface{}{
							"required": true,
							"email":    true,
						},
					},
					{
						Name: "role",
						Type: "select",
						Rules: map[string]interface{}{
							"required": true,
						},
					},
				},
			},
			{
				Name:     "tags",
				Type:     "text",
				Label:    "Tags",
				Multiple: true,
				Rules: map[string]interface{}{
					"unique":    true,
					"maxlength": 30,
				},
			},
		},
	}

	v := validator.NewValidator(spec)

	// Valid data
	validData := map[string]interface{}{
		"company": map[string]interface{}{
			"name": "Acme Corp",
			"address": map[string]interface{}{
				"street":  "123 Business Ave",
				"city":    "Seoul",
				"country": "KR",
			},
		},
		"employees": []interface{}{
			map[string]interface{}{
				"name":  "John Doe",
				"email": "john@acme.com",
				"role":  "developer",
			},
			map[string]interface{}{
				"name":  "Jane Smith",
				"email": "jane@acme.com",
				"role":  "designer",
			},
		},
		"tags": []interface{}{"technology", "software", "startup"},
	}

	// Invalid data
	invalidData := map[string]interface{}{
		"company": map[string]interface{}{
			"name": "", // Required
			"address": map[string]interface{}{
				"street":  "123 Business Ave",
				"city":    "", // Required
				"country": "KR",
			},
		},
		"employees": []interface{}{
			map[string]interface{}{
				"name":  "John Doe",
				"email": "invalid-email", // Invalid
				"role":  "developer",
			},
		},
		"tags": []interface{}{"technology", "technology"}, // Duplicate
	}

	validResult := v.Validate(validData)
	invalidResult := v.Validate(invalidData)

	fmt.Printf("Valid data: IsValid=%v\n", validResult.IsValid)
	fmt.Printf("Invalid data: IsValid=%v\n", invalidResult.IsValid)
	if !invalidResult.IsValid {
		fmt.Println("Errors:")
		for _, err := range invalidResult.Errors {
			fmt.Printf("  - %s: %s\n", err.Field, err.Message)
		}
	}
	fmt.Println()
}

// =============================================================================
// Custom Rules
// =============================================================================

// customRulesExample demonstrates adding custom validation rules
func customRulesExample() {
	fmt.Println("=== Custom Rules Example ===")

	spec := validator.Spec{
		Fields: []validator.Field{
			{
				Name: "username",
				Type: "text",
				Rules: map[string]interface{}{
					"required":     true,
					"no_profanity": true,
				},
				Messages: map[string]string{
					"no_profanity": "Username contains inappropriate content.",
				},
			},
			{
				Name: "password",
				Type: "password",
				Rules: map[string]interface{}{
					"required":  true,
					"minlength": 8,
				},
			},
			{
				Name: "password_confirm",
				Type: "password",
				Rules: map[string]interface{}{
					"required": true,
					"matches":  "password",
				},
				Messages: map[string]string{
					"matches": "Passwords do not match.",
				},
			},
		},
	}

	v := validator.NewValidator(spec)

	// Register custom rule: no_profanity
	v.AddRule("no_profanity", func(value interface{}, params []string, allData map[string]interface{}, ctx *validator.ValidationContext) *string {
		strValue, ok := value.(string)
		if !ok || strValue == "" {
			return nil
		}

		profanityList := []string{"badword1", "badword2", "inappropriate"}
		lowercaseValue := strings.ToLower(strValue)

		for _, word := range profanityList {
			if strings.Contains(lowercaseValue, word) {
				msg := "Contains inappropriate content"
				return &msg
			}
		}
		return nil
	})

	// Register custom rule: matches (compare with another field)
	v.AddRule("matches", func(value interface{}, params []string, allData map[string]interface{}, ctx *validator.ValidationContext) *string {
		if len(params) == 0 {
			return nil
		}

		otherFieldName := params[0]
		otherValue, exists := allData[otherFieldName]
		if !exists {
			msg := "Field to match not found"
			return &msg
		}

		if value != otherValue {
			msg := "Values do not match"
			return &msg
		}
		return nil
	})

	// Test data - valid
	validData := map[string]interface{}{
		"username":         "gooduser123",
		"password":         "SecurePass123",
		"password_confirm": "SecurePass123",
	}

	// Test data - invalid
	invalidData := map[string]interface{}{
		"username":         "user_badword1_name",
		"password":         "SecurePass123",
		"password_confirm": "DifferentPass456",
	}

	validResult := v.Validate(validData)
	invalidResult := v.Validate(invalidData)

	fmt.Printf("Valid data: IsValid=%v\n", validResult.IsValid)
	fmt.Printf("Invalid data: IsValid=%v\n", invalidResult.IsValid)
	if !invalidResult.IsValid {
		fmt.Println("Errors:")
		for _, err := range invalidResult.Errors {
			fmt.Printf("  - %s: %s\n", err.Field, err.Message)
		}
	}
	fmt.Println()
}

// =============================================================================
// HTTP Handler Example
// =============================================================================

// ValidationRequest represents the request body for validation
type ValidationRequest struct {
	SpecName string                 `json:"spec_name"`
	Data     map[string]interface{} `json:"data"`
	Mode     string                 `json:"mode"` // "full" or "field"
	Path     string                 `json:"path,omitempty"`
	Value    interface{}            `json:"value,omitempty"`
}

// ValidationResponse represents the validation response
type ValidationResponse struct {
	Valid  bool                       `json:"valid"`
	Errors []validator.ValidationError `json:"errors,omitempty"`
	Error  string                     `json:"error,omitempty"`
}

// loadSpec loads a spec from YAML file
func loadSpec(name string) (*validator.Spec, error) {
	specPath := fmt.Sprintf("./specs/%s.yml", name)
	specFile, err := os.ReadFile(specPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read spec file: %v", err)
	}

	var spec validator.Spec
	if err := yaml.Unmarshal(specFile, &spec); err != nil {
		return nil, fmt.Errorf("failed to parse spec YAML: %v", err)
	}

	return &spec, nil
}

// validateHandler handles validation requests
func validateHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		json.NewEncoder(w).Encode(ValidationResponse{
			Valid: false,
			Error: "Method not allowed",
		})
		return
	}

	body, err := io.ReadAll(r.Body)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(ValidationResponse{
			Valid: false,
			Error: "Failed to read request body",
		})
		return
	}

	var req ValidationRequest
	if err := json.Unmarshal(body, &req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(ValidationResponse{
			Valid: false,
			Error: "Invalid JSON",
		})
		return
	}

	spec, err := loadSpec(req.SpecName)
	if err != nil {
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(ValidationResponse{
			Valid: false,
			Error: err.Error(),
		})
		return
	}

	v := validator.NewValidator(*spec)

	if req.Mode == "field" {
		// Single field validation
		errMsg := v.ValidateField(req.Path, req.Value, req.Data)
		if errMsg != nil {
			json.NewEncoder(w).Encode(ValidationResponse{
				Valid: false,
				Error: *errMsg,
			})
		} else {
			json.NewEncoder(w).Encode(ValidationResponse{
				Valid: true,
			})
		}
	} else {
		// Full form validation
		result := v.Validate(req.Data)
		json.NewEncoder(w).Encode(ValidationResponse{
			Valid:  result.IsValid,
			Errors: result.Errors,
		})
	}
}

// httpHandlerExample shows HTTP handler integration
func httpHandlerExample() {
	fmt.Println("=== HTTP Handler Example ===")

	exampleCode := `
// Example HTTP server setup
func main() {
    http.HandleFunc("/api/validate", validateHandler)

    fmt.Println("Server running on :8080")
    http.ListenAndServe(":8080", nil)
}

// Example client request:
// POST /api/validate
// {
//     "spec_name": "user-registration",
//     "data": {
//         "email": "user@example.com",
//         "password": "SecurePass123"
//     }
// }

// Example single field validation:
// POST /api/validate
// {
//     "spec_name": "user-registration",
//     "mode": "field",
//     "path": "email",
//     "value": "user@example.com",
//     "data": {"email": "user@example.com"}
// }
`
	fmt.Println(exampleCode)
}

// =============================================================================
// Gin Framework Integration
// =============================================================================

// ginFrameworkExample shows Gin framework integration
func ginFrameworkExample() {
	fmt.Println("=== Gin Framework Integration Example ===")

	exampleCode := `
package main

import (
    "net/http"

    "github.com/gin-gonic/gin"
    validator "github.com/limepie/form-generator/validator/go/validator"
    "gopkg.in/yaml.v3"
)

// FormValidatorMiddleware creates a validation middleware
func FormValidatorMiddleware(specPath string) gin.HandlerFunc {
    // Load spec at startup
    specFile, _ := os.ReadFile(specPath)
    var spec validator.Spec
    yaml.Unmarshal(specFile, &spec)
    v := validator.NewValidator(spec)

    return func(c *gin.Context) {
        var data map[string]interface{}
        if err := c.ShouldBindJSON(&data); err != nil {
            c.JSON(http.StatusBadRequest, gin.H{
                "success": false,
                "error":   "Invalid JSON",
            })
            c.Abort()
            return
        }

        result := v.Validate(data)
        if !result.IsValid {
            c.JSON(http.StatusUnprocessableEntity, gin.H{
                "success": false,
                "message": "Validation failed",
                "errors":  result.Errors,
            })
            c.Abort()
            return
        }

        // Store validated data in context
        c.Set("validatedData", data)
        c.Next()
    }
}

func main() {
    r := gin.Default()

    // Apply validation middleware to specific routes
    r.POST("/api/users", FormValidatorMiddleware("./specs/user-registration.yml"), func(c *gin.Context) {
        data := c.MustGet("validatedData").(map[string]interface{})

        // Process validated data...
        c.JSON(http.StatusCreated, gin.H{
            "success": true,
            "message": "User created successfully",
            "data":    data,
        })
    })

    r.POST("/api/products", FormValidatorMiddleware("./specs/product-form.yml"), func(c *gin.Context) {
        data := c.MustGet("validatedData").(map[string]interface{})

        // Save product...
        c.JSON(http.StatusCreated, gin.H{
            "success": true,
            "message": "Product saved successfully",
        })
    })

    r.Run(":8080")
}
`
	fmt.Println(exampleCode)
}

// =============================================================================
// Single Field Validation
// =============================================================================

// singleFieldValidationExample validates individual fields for real-time feedback
func singleFieldValidationExample() {
	fmt.Println("=== Single Field Validation Example ===")

	spec := validator.Spec{
		Fields: []validator.Field{
			{
				Name: "email",
				Type: "email",
				Rules: map[string]interface{}{
					"required": true,
					"email":    true,
				},
				Messages: map[string]string{
					"required": "Email is required.",
					"email":    "Invalid email format.",
				},
			},
			{
				Name: "password",
				Type: "password",
				Rules: map[string]interface{}{
					"required":  true,
					"minlength": 8,
				},
			},
			{
				Name: "age",
				Type: "number",
				Rules: map[string]interface{}{
					"required": true,
					"min":      18,
					"max":      120,
				},
			},
		},
	}

	v := validator.NewValidator(spec)

	// Simulate real-time validation as user types
	simulatedInputs := []struct {
		path    string
		value   interface{}
		allData map[string]interface{}
	}{
		{"email", "", map[string]interface{}{}},
		{"email", "test", map[string]interface{}{"email": "test"}},
		{"email", "test@", map[string]interface{}{"email": "test@"}},
		{"email", "test@example.com", map[string]interface{}{"email": "test@example.com"}},
		{"password", "123", map[string]interface{}{"password": "123"}},
		{"password", "12345678", map[string]interface{}{"password": "12345678"}},
		{"age", 15, map[string]interface{}{"age": 15}},
		{"age", 25, map[string]interface{}{"age": 25}},
	}

	for _, input := range simulatedInputs {
		errMsg := v.ValidateField(input.path, input.value, input.allData)
		if errMsg != nil {
			fmt.Printf("Field \"%s\" = \"%v\": %s\n", input.path, input.value, *errMsg)
		} else {
			fmt.Printf("Field \"%s\" = \"%v\": Valid\n", input.path, input.value)
		}
	}
	fmt.Println()
}

// =============================================================================
// Pattern Matching Example
// =============================================================================

// patternMatchingExample demonstrates pattern/regex validation
func patternMatchingExample() {
	fmt.Println("=== Pattern Matching Example ===")

	spec := validator.Spec{
		Fields: []validator.Field{
			{
				Name:  "phone",
				Type:  "text",
				Label: "Phone Number",
				Rules: map[string]interface{}{
					"required": true,
					"match":    "^[0-9]{2,3}-[0-9]{3,4}-[0-9]{4}$",
				},
				Messages: map[string]string{
					"required": "Phone number is required.",
					"match":    "Please enter a valid phone format (e.g., 010-1234-5678).",
				},
			},
			{
				Name:  "postal_code",
				Type:  "text",
				Label: "Postal Code",
				Rules: map[string]interface{}{
					"required": true,
					"match":    "^[0-9]{5}$",
				},
				Messages: map[string]string{
					"required": "Postal code is required.",
					"match":    "Please enter a 5-digit postal code.",
				},
			},
			{
				Name:  "username",
				Type:  "text",
				Label: "Username",
				Rules: map[string]interface{}{
					"required": true,
					"match":    "^[a-zA-Z][a-zA-Z0-9_]{3,19}$",
				},
				Messages: map[string]string{
					"required": "Username is required.",
					"match":    "Username must start with a letter, 4-20 characters, letters/numbers/underscore only.",
				},
			},
		},
	}

	v := validator.NewValidator(spec)

	// Test cases
	testCases := []map[string]interface{}{
		{"phone": "010-1234-5678", "postal_code": "12345", "username": "user123"},      // Valid
		{"phone": "1234567890", "postal_code": "12345", "username": "user123"},         // Invalid phone
		{"phone": "010-1234-5678", "postal_code": "1234", "username": "user123"},       // Invalid postal
		{"phone": "010-1234-5678", "postal_code": "12345", "username": "123user"},      // Invalid username
	}

	for i, data := range testCases {
		result := v.Validate(data)
		fmt.Printf("Test case %d: IsValid=%v\n", i+1, result.IsValid)
		if !result.IsValid {
			for _, err := range result.Errors {
				fmt.Printf("  - %s: %s\n", err.Field, err.Message)
			}
		}
	}
	fmt.Println()
}

// =============================================================================
// Main - Run All Examples
// =============================================================================

func main() {
	fmt.Println("Form Generator - Go Validation Examples")
	fmt.Println(strings.Repeat("=", 60))
	fmt.Println()

	basicExample()
	// yamlFileExample() // Uncomment when YAML file exists
	conditionalRequiredExample()
	nestedGroupsExample()
	customRulesExample()
	httpHandlerExample()
	ginFrameworkExample()
	singleFieldValidationExample()
	patternMatchingExample()

	fmt.Println(strings.Repeat("=", 60))
	fmt.Println("All examples completed.")
}
