export function ProgressBar({ step, total }: { step: number; total: number }) {
  return (
    <div className="orbit">
      <p className="step-label">{`Шаг ${step} из ${total}`}</p>
      <div
        className={`progress progress-${step}`}
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={step}
        aria-label={`Шаг ${step} из ${total}`}
      >
        {Array.from({ length: total }, (_, index) => (
          <span key={index} className={index < step ? "on" : undefined} />
        ))}
      </div>
    </div>
  )
}