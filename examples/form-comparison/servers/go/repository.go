package main

import (
	"bytes"
	"errors"
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

// withLock runs operation under an exclusive lock on file.
func withLock(file string, operation func() (any, error)) (result any, err error) {
	lock, err := os.OpenFile(file+".lock", os.O_CREATE|os.O_RDWR, 0600)
	if err != nil {
		return nil, err
	}
	// Closing the file releases its lock too; an error of either joins the error of the operation.
	defer func() { err = errors.Join(err, lock.Close()) }()
	if err = syscall.Flock(int(lock.Fd()), syscall.LOCK_EX); err != nil {
		return nil, err
	}
	defer func() { err = errors.Join(err, syscall.Flock(int(lock.Fd()), syscall.LOCK_UN)) }()
	return operation()
}

// lockedFile runs operation on the decoded contents of file under an exclusive lock, seeding a
// missing file, and atomically replaces the file when the missing file was seeded or the contents
// changed. An unreadable or malformed file fails and is left as it is.
func lockedFile(file string, seed func() (any, error), operation func(any) (any, any, error)) (any, error) {
	return withLock(file, func() (any, error) {
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
		return result, replaceFile(file, encoded)
	})
}

// replaceLocked replaces file with value under its exclusive lock, whatever the file holds.
func replaceLocked(file string, value any) error {
	encoded, err := encodeJSON(value)
	if err != nil {
		return err
	}
	_, err = withLock(file, func() (any, error) { return nil, replaceFile(file, append(encoded, '\n')) })
	return err
}

// replaceFile atomically replaces file with encoded through a temporary file in its directory.
func replaceFile(file string, encoded []byte) error {
	temp, err := os.CreateTemp(filepath.Dir(file), ".form-")
	if err != nil {
		return err
	}
	name := temp.Name()
	if _, err = temp.Write(encoded); err == nil {
		err = temp.Sync()
	}
	if err = errors.Join(err, temp.Close()); err == nil {
		err = os.Rename(name, file)
	}
	if err != nil {
		// The temporary file stays only when the replacement failed.
		return errors.Join(err, os.Remove(name))
	}
	return nil
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
	state, ok := result.(*object)
	if !ok {
		return nil, fmt.Errorf("Expected stored object")
	}
	return state, nil
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

// storedRows returns the rows of kind in a stored state; the state is read from the form file, so a
// missing or mistyped collection is a wrong input.
func storedRows(state *object, kind string) ([]any, error) {
	rows, ok := get(state, kind).([]any)
	if !ok {
		return nil, fmt.Errorf("Expected stored %s", kind)
	}
	return rows, nil
}

func sortedRows(state *object, kind, parent, sequence string) ([]*object, error) {
	items, err := storedRows(state, kind)
	if err != nil {
		return nil, err
	}
	result := []*object{}
	for _, item := range items {
		row, ok := item.(*object)
		if !ok {
			return nil, fmt.Errorf("Expected stored %s row", kind)
		}
		if parent == "" || get(row, parent+"_seq") == sequence {
			result = append(result, row)
		}
	}
	sort.SliceStable(result, func(i, j int) bool { return integer(get(result[i], "position")) < integer(get(result[j], "position")) })
	return result, nil
}

// loadData reconstructs collection order from stored positions and parent IDs.
func loadData(state *object) (*object, error) {
	companies := []row{}
	companyRows, err := sortedRows(state, "companies", "", "")
	if err != nil {
		return nil, err
	}
	for _, company := range companyRows {
		companySeq, ok := get(company, "company_seq").(string)
		if !ok {
			return nil, fmt.Errorf("Expected stored company_seq")
		}
		stores := []row{}
		storeRows, err := sortedRows(state, "stores", "company", companySeq)
		if err != nil {
			return nil, err
		}
		for _, store := range storeRows {
			storeSeq, ok := get(store, "store_seq").(string)
			if !ok {
				return nil, fmt.Errorf("Expected stored store_seq")
			}
			departments := []row{}
			departmentRows, err := sortedRows(state, "departments", "store", storeSeq)
			if err != nil {
				return nil, err
			}
			for _, department := range departmentRows {
				seq, ok := get(department, "department_seq").(string)
				if !ok {
					return nil, fmt.Errorf("Expected stored department_seq")
				}
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
		candidate, ok := raw.(*object)
		if !ok {
			return "", fmt.Errorf("Expected stored %s row", kind)
		}
		seq, ok := get(candidate, field).(string)
		if !ok {
			return "", fmt.Errorf("Expected stored %s", field)
		}
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

func owned(items []any, parent, sequence string) ([]any, error) {
	result := []any{}
	for _, raw := range items {
		item, ok := raw.(*object)
		if !ok {
			return nil, fmt.Errorf("Expected stored row of %s", parent)
		}
		if get(item, parent+"_seq") == sequence {
			result = append(result, raw)
		}
	}
	return result, nil
}

func checkParent(key string, items []any, kind, parent, sequence string) error {
	for _, raw := range items {
		item, ok := raw.(*object)
		if !ok {
			return fmt.Errorf("Expected stored %s row", kind)
		}
		seq, ok := get(item, kind+"_seq").(string)
		if !ok {
			return fmt.Errorf("Expected stored %s_seq", kind)
		}
		saved, err := sequenceKey(seq)
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
		next, ok := clone(get(before, "next")).(*object)
		if !ok {
			return nil, nil, fmt.Errorf("Expected stored next counters")
		}
		storedCompanies, err := storedRows(before, "companies")
		if err != nil {
			return nil, nil, err
		}
		storedStores, err := storedRows(before, "stores")
		if err != nil {
			return nil, nil, err
		}
		storedDepartments, err := storedRows(before, "departments")
		if err != nil {
			return nil, nil, err
		}
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
			companySeq, err := allocate(company, storedCompanies, "company", next, seenCompany)
			if err != nil {
				return nil, nil, err
			}
			companies = append(companies, record("company_seq", companySeq, "name", get(company.value, "name"), "position", len(companies)))
			storeRows, err := rows(get(company.value, "stores"), "stores")
			if err != nil {
				return nil, nil, err
			}
			for i, store := range storeRows {
				if err = checkParent(store.key, storedStores, "store", "company", companySeq); err != nil {
					return nil, nil, err
				}
				ownedStores, err := owned(storedStores, "company", companySeq)
				if err != nil {
					return nil, nil, err
				}
				storeSeq, err := allocate(store, ownedStores, "store", next, seenStore)
				if err != nil {
					return nil, nil, err
				}
				stores = append(stores, record("store_seq", storeSeq, "company_seq", companySeq, "position", i, "name", get(store.value, "name"), "enabled", get(store.value, "enabled"), "detail", get(store.value, "detail"), "title", get(store.value, "title")))
				departmentRows, err := rows(get(store.value, "departments"), "departments")
				if err != nil {
					return nil, nil, err
				}
				for j, department := range departmentRows {
					if err = checkParent(department.key, storedDepartments, "department", "store", storeSeq); err != nil {
						return nil, nil, err
					}
					ownedDepartments, err := owned(storedDepartments, "store", storeSeq)
					if err != nil {
						return nil, nil, err
					}
					departmentSeq, err := allocate(department, ownedDepartments, "department", next, seenDepartment)
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
