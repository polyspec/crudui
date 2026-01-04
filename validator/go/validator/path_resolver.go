package validator

import (
	"strconv"
	"strings"
)

// PathResolver resolves field paths in form data
type PathResolver struct {
	formData map[string]interface{}
}

// NewPathResolver creates a new path resolver
func NewPathResolver(formData map[string]interface{}) *PathResolver {
	return &PathResolver{
		formData: formData,
	}
}

// ResolvePath resolves a path string to an absolute path array
func (pr *PathResolver) ResolvePath(pathStr string, currentPath []string) []string {
	if pathStr == "" {
		return currentPath
	}

	// Check for relative path prefix
	if strings.HasPrefix(pathStr, ".") {
		return pr.resolveRelativePath(pathStr, currentPath)
	}

	// Absolute path
	return pr.parsePathString(pathStr)
}

// resolveRelativePath resolves a relative path (starting with . or ..)
func (pr *PathResolver) resolveRelativePath(pathStr string, currentPath []string) []string {
	// Count dots at the beginning
	dotCount := 0
	for i := 0; i < len(pathStr) && pathStr[i] == '.'; i++ {
		dotCount++
	}

	// levelsUp: . = 0 (sibling), .. = 1 (parent), ... = 2 (grandparent)
	levelsUp := dotCount - 1
	if levelsUp < 0 {
		levelsUp = 0
	}

	// Get the remaining path after dots
	remaining := pathStr[dotCount:]
	if remaining == "" {
		return currentPath
	}

	// Calculate base path (go up levelsUp + 1 levels from current)
	baseLen := len(currentPath) - (levelsUp + 1)
	if baseLen < 0 {
		baseLen = 0
	}
	basePath := make([]string, baseLen)
	copy(basePath, currentPath[:baseLen])

	// Parse and append remaining segments
	segments := pr.parsePathString(remaining)
	return append(basePath, segments...)
}

// parsePathString parses a path string into segments
func (pr *PathResolver) parsePathString(pathStr string) []string {
	if pathStr == "" {
		return nil
	}

	// Remove leading dot if present
	if strings.HasPrefix(pathStr, ".") {
		pathStr = pathStr[1:]
	}

	// Split by dots
	parts := strings.Split(pathStr, ".")
	var result []string

	for _, part := range parts {
		if part == "" {
			continue
		}
		result = append(result, part)
	}

	return result
}

// GetValue retrieves a value from form data by path
func (pr *PathResolver) GetValue(path []string) interface{} {
	if len(path) == 0 {
		return pr.formData
	}

	var current interface{} = pr.formData

	for _, segment := range path {
		if current == nil {
			return nil
		}

		switch v := current.(type) {
		case map[string]interface{}:
			current = v[segment]
		case []interface{}:
			idx, err := strconv.Atoi(segment)
			if err != nil || idx < 0 || idx >= len(v) {
				return nil
			}
			current = v[idx]
		default:
			return nil
		}
	}

	return current
}

// GetValueByPathString retrieves a value using a path string
func (pr *PathResolver) GetValueByPathString(pathStr string, currentPath []string) interface{} {
	path := pr.ResolvePath(pathStr, currentPath)
	return pr.GetValue(path)
}

// SetValue sets a value in form data by path
func (pr *PathResolver) SetValue(path []string, value interface{}) bool {
	if len(path) == 0 {
		return false
	}

	var current interface{} = pr.formData

	for i := 0; i < len(path)-1; i++ {
		segment := path[i]

		switch v := current.(type) {
		case map[string]interface{}:
			if v[segment] == nil {
				// Create intermediate objects
				v[segment] = make(map[string]interface{})
			}
			current = v[segment]
		case []interface{}:
			idx, err := strconv.Atoi(segment)
			if err != nil || idx < 0 || idx >= len(v) {
				return false
			}
			current = v[idx]
		default:
			return false
		}
	}

	// Set the final value
	lastSegment := path[len(path)-1]
	switch v := current.(type) {
	case map[string]interface{}:
		v[lastSegment] = value
		return true
	case []interface{}:
		idx, err := strconv.Atoi(lastSegment)
		if err != nil || idx < 0 || idx >= len(v) {
			return false
		}
		v[idx] = value
		return true
	default:
		return false
	}
}

// PathToString converts a path array to a dot-separated string
func PathToString(path []string) string {
	return strings.Join(path, ".")
}

// StringToPath converts a dot-separated string to a path array
func StringToPath(pathStr string) []string {
	if pathStr == "" {
		return nil
	}
	return strings.Split(pathStr, ".")
}

// PathContainsWildcard checks if a path contains a wildcard (*)
func PathContainsWildcard(path []string) bool {
	for _, segment := range path {
		if segment == "*" {
			return true
		}
	}
	return false
}

// ExpandWildcardPath expands a path with wildcard to all matching paths
func (pr *PathResolver) ExpandWildcardPath(path []string) [][]string {
	wildcardIndex := -1
	for i, segment := range path {
		if segment == "*" {
			wildcardIndex = i
			break
		}
	}

	if wildcardIndex == -1 {
		return [][]string{path}
	}

	// Get the array at the path before the wildcard
	arrayPath := path[:wildcardIndex]
	arrayData := pr.GetValue(arrayPath)

	arr, ok := arrayData.([]interface{})
	if !ok {
		return nil
	}

	// Generate paths for each array element
	remainingPath := path[wildcardIndex+1:]
	var result [][]string

	for i := range arr {
		expandedPath := make([]string, len(arrayPath)+1+len(remainingPath))
		copy(expandedPath, arrayPath)
		expandedPath[len(arrayPath)] = strconv.Itoa(i)
		copy(expandedPath[len(arrayPath)+1:], remainingPath)

		// Recursively expand if there are more wildcards
		if PathContainsWildcard(remainingPath) {
			subPaths := pr.ExpandWildcardPath(expandedPath)
			result = append(result, subPaths...)
		} else {
			result = append(result, expandedPath)
		}
	}

	return result
}

// GetWildcardValues retrieves all values matching a wildcard path
func (pr *PathResolver) GetWildcardValues(path []string) []interface{} {
	expandedPaths := pr.ExpandWildcardPath(path)
	var values []interface{}

	for _, p := range expandedPaths {
		value := pr.GetValue(p)
		values = append(values, value)
	}

	return values
}

// FindArrayIndexInPath finds the array index in the current path for wildcard resolution
func FindArrayIndexInPath(currentPath []string, wildcardPath []string) int {
	// Find where the wildcard would be in the current path
	for i := 0; i < len(wildcardPath) && i < len(currentPath); i++ {
		if wildcardPath[i] == "*" {
			// Return the index from current path at this position
			idx, err := strconv.Atoi(currentPath[i])
			if err == nil {
				return idx
			}
		}
	}
	return -1
}

// ResolveWildcardForCurrentIndex resolves a wildcard path using the current array index
func (pr *PathResolver) ResolveWildcardForCurrentIndex(path []string, currentPath []string) []string {
	result := make([]string, len(path))
	copy(result, path)

	for i, segment := range result {
		if segment == "*" && i < len(currentPath) {
			// Use the index from current path
			result[i] = currentPath[i]
		}
	}

	return result
}

// IsNestedPath checks if path2 is nested within path1
func IsNestedPath(path1, path2 []string) bool {
	if len(path1) >= len(path2) {
		return false
	}

	for i := range path1 {
		if path1[i] != path2[i] {
			return false
		}
	}

	return true
}

// GetParentPath returns the parent path (one level up)
func GetParentPath(path []string) []string {
	if len(path) <= 1 {
		return nil
	}
	result := make([]string, len(path)-1)
	copy(result, path[:len(path)-1])
	return result
}

// GetFieldName returns the last segment of a path (the field name)
func GetFieldName(path []string) string {
	if len(path) == 0 {
		return ""
	}
	return path[len(path)-1]
}

// CopyPath creates a copy of a path
func CopyPath(path []string) []string {
	if path == nil {
		return nil
	}
	result := make([]string, len(path))
	copy(result, path)
	return result
}

// AppendToPath appends segments to a path, returning a new path
func AppendToPath(path []string, segments ...string) []string {
	result := make([]string, len(path)+len(segments))
	copy(result, path)
	copy(result[len(path):], segments)
	return result
}
