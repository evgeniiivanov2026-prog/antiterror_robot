import { Button } from "./Button";

export function LoadingState({ label = "Сохраняем карточку…" }: { label?: string }) {
  return (
    <p className="state" role="status">
      {label}
    </p>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="state state-error" role="alert">
      <p>{message}</p>
      {onRetry ? (
        <Button variant="ghost" onClick={onRetry}>
          Попробовать снова
        </Button>
      ) : null}
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return <p className="state">{message}</p>;
}
