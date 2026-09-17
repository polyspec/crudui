package main

import (
	"bytes"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"syscall"
)

type repository struct{ file, fixtures string }
type inputError string

func (e inputError) Error() string { return string(e) }

func readObject(file string) (*object, error) {
	bytes, err := os.ReadFile(file)
	if err != nil {
		return nil, err
	}
	value, err := decodeJSON(bytes)
	if err != nil {
		return nil, err
	}
	result, ok := value.(*object)
	if !ok {
		return nil, fmt.Errorf("Expected stored object")
	}
	return result, nil
}

func (r repository) fixture(name string) (*object, error) {
	fixtures, err := readObject(r.fixtures)
	if err != nil {
		return nil, err
	}
	value, ok := get(fixtures, name).(*object)
	if !ok {
		return nil, inputError("Unknown fixture")
	}
	return value, nil
}

// lockedFile runs operation on the decoded contents of file under an exclusive lock, seeding a
// missing file, and atomically replaces the file when the missing file was seeded or the contents
// changed. An unreadable or malformed file fails and is left as it is.
func lockedFile(file string, seed func() (any, error), operation func(any) (any, any, error)) (any, error) {
	lock, err := os.OpenFile(file+".lock", os.O_CREATE|os.O_RDWR, 0600)
	if err != nil {
		return nil, err
	}
	defer lock.Close()
	if err = syscall.Flock(int(lock.Fd()), syscall.LOCK_EX); err != nil {
		return nil, err
	}
	defer syscall.Flock(int(lock.Fd()), syscall.LOCK_UN)
	var before any
	stored, err := os.ReadFile(file)
	missing := os.IsNotExist(err)
	switch {
	case missing:
		before, err = seed()
	case err == nil:
		before, err = decodeJSON(stored)
	}
	if err != nil {
		return nil, err
	}
	after, result, err := operation(before)
	if err != nil {
		return nil, err
	}
	encoded, err := encodeJSON(after)
	if err != nil {
		return nil, err
	}
	encoded = append(encoded, '\n')
	if !missing && bytes.Equal(stored, encoded) {
		return result, nil
	}
	temp, err := os.CreateTemp(filepath.Dir(file), ".form-")
	if err != nil {
		return nil, err
	}
	name := temp.Name()
	defer os.Remove(name)
	if _, err = temp.Write(encoded); err != nil {
		temp.Close()
		return nil, err
	}
	if err = temp.Sync(); err != nil {
		temp.Close()
		return nil, err
	}
	if err = temp.Close(); err != nil {
		return nil, err
	}
	if err = os.Rename(name, file); err != nil {
		return nil, err
	}
	return result, nil
}

// transaction locks the form file and atomically replaces changed records.
func (r repository) transaction(operation func(*object) (*object, *object, error)) (*object, error) {
	result, err := lockedFile(r.file, func() (any, error) { return r.fixture("default") },
		func(value any) (any, any, error) {
			state, ok := value.(*object)
			if !ok {
				return nil, nil, fmt.Errorf("Expected stored object")
			}
			after, result, err := operation(state)
			return after, result, err
		})
	if err != nil {
		return nil, err
	}
	return result.(*object), nil
}

func (r repository) read() (*object, error) {
	return r.transaction(func(state *object) (*object, *object, error) { return state, state, nil })
}
func (r repository) reset(name string) (*object, error) {
	state, err := r.fixture(name)
	if err != nil {
		return nil, err
	}
	return r.transaction(func(_ *object) (*object, *object, error) { return state, state, nil })
}

func sequenceKey(sequence string) (string, error) {
	if len(sequence) < 1 || len(sequence) > 13 {
		return "", fmt.Errorf("Invalid stored sequence")
	}
	for _, char := range sequence {
		if char < '0' || char > '9' {
			return "", fmt.Errorf("Invalid stored sequence")
		}
	}
	return "__" + strings.Repeat("0", 13-len(sequence)) + sequence + "__", nil
}

func integer(value any) int {
	switch value := value.(type) {
	case int:
		return value
	case float64:
		return int(value)
	}
	panic("Expected stored integer")
}
func storedRows(state *object, kind string) []any { return get(state, kind).([]any) }

func sortedRows(items []any, parent, sequence string) []*object {
	result := []*object{}
	for _, item := range items {
		row := item.(*object)
		if parent == "" || get(row, parent+"_seq") == sequence {
			result = append(result, row)
		}
	}
	sort.SliceStable(result, func(i, j int) bool { return integer(get(result[i], "position")) < integer(get(result[j], "position")) })
	return result
}

// loadData reconstructs collection order from stored positions and parent IDs.
func loadData(state *object) (*object, error) {
	companies := []row{}
	for _, company := range sortedRows(storedRows(state, "companies"), "", "") {
		companySeq := get(company, "company_seq").(string)
		stores := []row{}
		for _, store := range sortedRows(storedRows(state, "stores"), "company", companySeq) {
			storeSeq := get(store, "store_seq").(string)
			departments := []row{}
			for _, department := range sortedRows(storedRows(state, "departments"), "store", storeSeq) {
				seq := get(department, "department_seq").(string)
				key, err := sequenceKey(seq)
				if err != nil {
					return nil, err
				}
				departments = append(departments, row{key, record("name", get(department, "name"))})
			}
			key, err := sequenceKey(storeSeq)
			if err != nil {
				return nil, err
			}
			value := record("name", get(store, "name"), "enabled", get(store, "enabled"), "detail", get(store, "detail"), "title", clone(get(store, "title")), "departments", rowCollection(departments))
			stores = append(stores, row{key, value})
		}
		key, err := sequenceKey(companySeq)
		if err != nil {
			return nil, err
		}
		value := record("name", get(company, "name"), "stores", rowCollection(stores))
		companies = append(companies, row{key, value})
	}
	return record("companies", rowCollection(companies)), nil
}

func allocate(item row, existing []any, kind string, next *object, seen map[string]bool) (string, error) {
	field := kind + "_seq"
	sequence := ""
	for _, raw := range existing {
		candidate := raw.(*object)
		seq := get(candidate, field).(string)
		key, err := sequenceKey(seq)
		if err != nil {
			return "", err
		}
		if key == item.key {
			sequence = seq
			break
		}
	}
	if seen[sequence] {
		return "", inputError(fmt.Sprintf("Duplicate %s: %s", field, sequence))
	}
	if sequence == "" {
		number := integer(get(next, kind))
		sequence = strconv.Itoa(number)
		if _, err := sequenceKey(sequence); err != nil {
			return "", err
		}
		next.Set(kind, number+1)
	}
	seen[sequence] = true
	return sequence, nil
}

func owned(items []any, parent, sequence string) []any {
	result := []any{}
	for _, raw := range items {
		if get(raw.(*object), parent+"_seq") == sequence {
			result = append(result, raw)
		}
	}
	return result
}

func checkParent(key string, items []any, kind, parent, sequence string) error {
	for _, raw := range items {
		item := raw.(*object)
		saved, err := sequenceKey(get(item, kind+"_seq").(string))
		if err != nil {
			return err
		}
		if key == saved && get(item, parent+"_seq") != sequence {
			return inputError(fmt.Sprintf("Incorrect parent for %s_seq", kind))
		}
	}
	return nil
}

// save assigns sequences, preserves existing ownership and returns scoped key changes.
func (r repository) save(data *object) (*object, error) {
	return r.transaction(func(before *object) (*object, *object, error) {
		next := clone(get(before, "next")).(*object)
		companies, stores, departments, changes := []any{}, []any{}, []any{}, []any{}
		seenCompany, seenStore, seenDepartment := map[string]bool{}, map[string]bool{}, map[string]bool{}
		change := func(path, key, sequence string) error {
			saved, err := sequenceKey(sequence)
			if err != nil {
				return err
			}
			if saved != key {
				changes = append(changes, record("path", path, "oldKey", key, "newKey", saved))
			}
			return nil
		}
		companyRows, err := rows(get(data, "companies"), "companies")
		if err != nil {
			return nil, nil, err
		}
		for _, company := range companyRows {
			companySeq, err := allocate(company, storedRows(before, "companies"), "company", next, seenCompany)
			if err != nil {
				return nil, nil, err
			}
			companies = append(companies, record("company_seq", companySeq, "name", get(company.value, "name"), "position", len(companies)))
			storeRows, err := rows(get(company.value, "stores"), "stores")
			if err != nil {
				return nil, nil, err
			}
			for i, store := range storeRows {
				if err = checkParent(store.key, storedRows(before, "stores"), "store", "company", companySeq); err != nil {
					return nil, nil, err
				}
				storeSeq, err := allocate(store, owned(storedRows(before, "stores"), "company", companySeq), "store", next, seenStore)
				if err != nil {
					return nil, nil, err
				}
				stores = append(stores, record("store_seq", storeSeq, "company_seq", companySeq, "position", i, "name", get(store.value, "name"), "enabled", get(store.value, "enabled"), "detail", get(store.value, "detail"), "title", get(store.value, "title")))
				departmentRows, err := rows(get(store.value, "departments"), "departments")
				if err != nil {
					return nil, nil, err
				}
				for j, department := range departmentRows {
					if err = checkParent(department.key, storedRows(before, "departments"), "department", "store", storeSeq); err != nil {
						return nil, nil, err
					}
					departmentSeq, err := allocate(department, owned(storedRows(before, "departments"), "store", storeSeq), "department", next, seenDepartment)
					if err != nil {
						return nil, nil, err
					}
					departments = append(departments, record("department_seq", departmentSeq, "store_seq", storeSeq, "position", j, "name", get(department.value, "name")))
					if err = change("companies."+company.key+".stores."+store.key+".departments", department.key, departmentSeq); err != nil {
						return nil, nil, err
					}
				}
				if err = change("companies."+company.key+".stores", store.key, storeSeq); err != nil {
					return nil, nil, err
				}
			}
			if err = change("companies", company.key, companySeq); err != nil {
				return nil, nil, err
			}
		}
		after := record("next", next, "companies", companies, "stores", stores, "departments", departments)
		loaded, err := loadData(after)
		if err != nil {
			return nil, nil, err
		}
		return after, record("storage", after, "data", loaded, "keyChanges", changes), nil
	})
}
