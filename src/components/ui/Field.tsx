type Props = {
  label: string;
  htmlFor?: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
};

export function Field({ label, htmlFor, required, hint, children }: Props) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium">
        {label}
        {required && (
          <span aria-hidden="true" className="ms-0.5 text-red-600 dark:text-red-400">
            *
          </span>
        )}
      </label>
      {children}
      {hint && <p className="text-xs opacity-60">{hint}</p>}
    </div>
  );
}
