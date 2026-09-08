/**
 * React Form Component that outputs the same HTML structure as Plain HTML
 * This demonstrates backward compatibility with Limepie validate.js
 */

const { useState, useEffect, useRef } = React;

// Input component that outputs validate.js compatible HTML
function ValidatedInput({
    type = 'text',
    name,
    id,
    label,
    placeholder,
    options,
    className = 'form-control'
}) {
    const inputRef = useRef(null);

    // For select inputs
    if (type === 'select') {
        return (
            <div className="input-group-wrapper">
                <label htmlFor={id} className="form-label">{label}</label>
                <select
                    ref={inputRef}
                    className={`form-select valid-target`}
                    id={id}
                    name={name}
                    data-rule-name={name}
                >
                    {options.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                </select>
            </div>
        );
    }

    // For checkbox inputs
    if (type === 'checkbox') {
        return (
            <div className="input-group-wrapper">
                <div className="form-check">
                    <input
                        ref={inputRef}
                        type="checkbox"
                        className="form-check-input valid-target"
                        id={id}
                        name={name}
                        data-rule-name={name}
                        value="1"
                    />
                    <label className="form-check-label" htmlFor={id}>
                        {label}
                    </label>
                </div>
            </div>
        );
    }

    // For standard inputs (text, email, password, number)
    return (
        <div className="input-group-wrapper">
            <label htmlFor={id} className="form-label">{label}</label>
            <input
                ref={inputRef}
                type={type}
                className={`${className} valid-target`}
                id={id}
                name={name}
                data-rule-name={name}
                placeholder={placeholder}
            />
        </div>
    );
}

// Main React Form Component
function ReactForm() {
    const formRef = useRef(null);
    const [result, setResult] = useState(null);
    const [isInitialized, setIsInitialized] = useState(false);

    // Initialize validate.js after component mounts
    useEffect(() => {
        if (formRef.current && window.$ && window.validationSpec) {
            // Initialize jQuery validator on the React form
            const $form = $(formRef.current);
            const validator = $form.validate({
                spec: window.validationSpec
            });

            setIsInitialized(true);

            console.log('React form validator initialized:', validator);
        }
    }, []);

    const handleValidate = () => {
        if (formRef.current) {
            const $form = $(formRef.current);
            const validator = $form.data('validator');

            if (validator) {
                const isValid = validator.loadvalid(true);
                setResult({
                    isValid,
                    message: isValid
                        ? 'Valid! All fields passed validation.'
                        : 'Invalid! Please fix the errors above.'
                });
            }
        }
    };

    const handleReset = () => {
        if (formRef.current) {
            formRef.current.reset();
            $(formRef.current).find('.message').remove();
            setResult(null);
        }
    };

    return (
        <form id="react-form" ref={formRef}>
            <ValidatedInput
                type="text"
                name="username"
                id="react-username"
                label="Username (required, min 3 chars)"
                placeholder="Enter username"
            />

            <ValidatedInput
                type="email"
                name="email"
                id="react-email"
                label="Email (required, valid email)"
                placeholder="Enter email"
            />

            <ValidatedInput
                type="password"
                name="password"
                id="react-password"
                label="Password (required, min 8 chars)"
                placeholder="Enter password"
            />

            <ValidatedInput
                type="password"
                name="password_confirm"
                id="react-password-confirm"
                label="Confirm Password (must match)"
                placeholder="Confirm password"
            />

            <ValidatedInput
                type="number"
                name="age"
                id="react-age"
                label="Age (optional, 18-100)"
                placeholder="Enter age"
            />

            <ValidatedInput
                type="select"
                name="country"
                id="react-country"
                label="Country (required)"
                options={[
                    { value: '', label: 'Select country' },
                    { value: 'kr', label: 'Korea' },
                    { value: 'us', label: 'United States' },
                    { value: 'jp', label: 'Japan' }
                ]}
            />

            <ValidatedInput
                type="checkbox"
                name="agree"
                id="react-agree"
                label="I agree to terms (required)"
            />

            <button
                type="button"
                className="btn btn-primary"
                onClick={handleValidate}
            >
                Validate Form
            </button>
            <button
                type="button"
                className="btn btn-secondary ms-2"
                onClick={handleReset}
            >
                Reset
            </button>

            {!isInitialized && (
                <div className="alert alert-warning mt-3">
                    Initializing validator...
                </div>
            )}

            {result && (
                <div className={`result-box mt-3 ${result.isValid ? 'result-success' : 'result-error'}`}>
                    <strong>{result.isValid ? 'Valid!' : 'Invalid!'}</strong> {result.message.split('!')[1]}
                </div>
            )}
        </form>
    );
}

// Render the React form
const root = ReactDOM.createRoot(document.getElementById('react-root'));
root.render(<ReactForm />);
