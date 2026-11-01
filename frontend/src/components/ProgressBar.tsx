export function ProgressBar({ step, total }: { step: number; total: number }) {
  return (
    <div
      className={`progress progress-${step}`}
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={total}
      aria-valuenow={step}
      aria-label={`Шаг ${step} из ${total}`}
    >
      <span />
    </div>
  );
}
