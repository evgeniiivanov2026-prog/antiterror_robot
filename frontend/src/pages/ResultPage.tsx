import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import { Button } from "../components/Button";
import { IncidentCard } from "../components/IncidentCard";
import { ErrorState, LoadingState } from "../components/ScreenState";
import { SafetyFooter } from "../components/SafetyFooter";
import { haptic, useBackButton } from "../hooks/useTelegram";
import { ApiError, deleteReport, exportPdf, getReport, sendCopy, updateStatus } from "../services/api";
import type { Report } from "../types/report";

export function ResultPage() {
  const { publicId = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const warning = (location.state as { warning?: string } | null)?.warning ?? null;
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(warning);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [busy, setBusy] = useState(false);

  useBackButton(() => navigate("/"));

  useEffect(() => {
    document.title = "Карточка — AntiTerror Robot";
    let active = true;
    setLoading(true);
    getReport(publicId)
      .then((value) => {
        if (active) setReport(value);
      })
      .catch((caught: unknown) => {
        if (active) setError(caught instanceof ApiError ? caught.message : "Карточка не найдена.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [publicId]);

  useEffect(() => {
    if (report) haptic("success");
  }, [report]);

  async function download() {
    if (!report) return;
    setBusy(true);
    try {
      const blob = await exportPdf(report.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${report.public_id}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (caught) {
      setNotice(caught instanceof ApiError ? caught.message : "Не удалось подготовить PDF.");
    } finally {
      setBusy(false);
    }
  }

  async function copyToChat() {
    if (!report) return;
    setBusy(true);
    try {
      await sendCopy(report.id);
      setNotice("Короткая копия и PDF отправлены в чат с ботом.");
    } catch (caught) {
      setNotice(caught instanceof ApiError ? caught.message : "Не удалось отправить копию.");
    } finally {
      setBusy(false);
    }
  }

  async function markForwarded() {
    if (!report) return;
    setBusy(true);
    try {
      setReport(await updateStatus(report.id, "forwarded"));
      setNotice("Статус обновлён: карточка сохранена для вашего обращения в МВД.");
    } catch (caught) {
      setNotice(caught instanceof ApiError ? caught.message : "Не удалось обновить статус.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!report) return;
    setBusy(true);
    try {
      await deleteReport(report.id);
      setDeleted(true);
    } catch (caught) {
      setNotice(caught instanceof ApiError ? caught.message : "Не удалось удалить карточку.");
    } finally {
      setBusy(false);
    }
  }

  if (deleted) {
    return (
      <section className="stack">
        <h1>Карточка удалена</h1>
        <p>Описание, контакт и файлы убраны с сервера. Это действие нельзя отменить.</p>
        <Button to="/">На главную</Button>
      </section>
    );
  }

  if (loading) return <LoadingState label="Открываем карточку…" />;
  if (error || !report) return <ErrorState message={error || "Карточка не найдена."} onRetry={() => navigate("/")} />;

  return (
    <section className="stack">
      <div>
        <p className="eyebrow">Готово</p>
        <h1>Карточка сохранена</h1>
        <p className="lede">Номер {report.public_id} не содержит ваших личных данных. Сохраните его, чтобы открыть карточку снова.</p>
      </div>
      {notice ? (
        <p className="note" role="status">
          {notice}
        </p>
      ) : null}
      <IncidentCard report={report} />
      <p>
        Чтобы заявление приняли, обратитесь в ближайшее отделение МВД или позвоните 102. Возьмите эту карточку и
        исходные скриншоты. Сервис не передаёт её в МВД и не сообщает о результате проверки.
      </p>
      <div className="stack">
        <Button onClick={() => void download()} disabled={busy}>
          Скачать PDF
        </Button>
        <Button variant="ghost" onClick={() => void copyToChat()} disabled={busy}>
          Отправить копию в чат
        </Button>
        {report.status === "new" ? (
          <Button variant="ghost" onClick={() => void markForwarded()} disabled={busy}>
            Я сохраню карточку для обращения в МВД
          </Button>
        ) : null}
      </div>
      {confirmDelete ? (
        <div className="note" role="alert">
          <p>Карточка и файлы будут удалены с сервера. Это нельзя отменить.</p>
          <div className="row">
            <Button variant="danger" onClick={() => void remove()} disabled={busy}>
              Удалить
            </Button>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Оставить
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="ghost" onClick={() => setConfirmDelete(true)}>
          Удалить карточку
        </Button>
      )}
      <SafetyFooter />
    </section>
  );
}
