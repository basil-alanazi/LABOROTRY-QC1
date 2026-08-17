export default function Input({ label, error, className = '', id, ...props }) {
  const inputId = id || props.name

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="block text-sm text-ink-muted mb-1.5 font-medium">
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={`w-full bg-surface-2 border rounded-btn px-4 py-3 text-ink placeholder:text-ink-muted outline-none transition-colors focus:border-primary focus:bg-surface ${
          error ? 'border-danger' : 'border-line'
        } ${className}`}
        {...props}
      />
      {error && <p className="text-danger text-xs mt-1.5">{error}</p>}
    </div>
  )
}
