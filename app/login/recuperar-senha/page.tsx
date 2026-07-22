"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/app/_shared/ui/button";
import { Input } from "@/app/_shared/ui/input";
import { Label } from "@/app/_shared/ui/label";
import {
  Loader2, ArrowLeft, ArrowRight, ShieldCheck, IdCard,
  Smartphone, Mail, KeyRound, LockKeyhole, Eye, EyeOff,
} from "lucide-react";
import { toast } from "sonner";
import { motion } from "motion/react";
import {
  getRecoveryChannels,
  requestPasswordReset,
  confirmPasswordReset,
  type RecoveryChannel,
  type RecoveryChannelInfo,
} from "@/app/_actions/auth/password-reset";
import { maskCpf } from "@/app/_shared/utils/format";
import { AuthShell } from "../sections/AuthShell";

type Step = "cpf" | "canal" | "codigo" | "pronto";

const STEP_INDEX: Record<Step, number> = { cpf: 0, canal: 1, codigo: 2, pronto: 3 };
const STEP_LABELS = ["CPF", "Envio", "Nova senha"];

function Stepper({ step }: { step: Step }) {
  const active = STEP_INDEX[step];
  return (
    <div className="mb-8 flex items-center gap-2">
      {STEP_LABELS.map((label, i) => {
        const done = active > i || step === "pronto";
        const current = active === i && step !== "pronto";
        return (
          <div key={label} className="flex flex-1 items-center gap-2">
            <div className="flex items-center gap-2">
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold transition-colors ${
                  done ? "bg-emerald-500 text-white" : current ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-500"
                }`}
              >
                {done ? "✓" : i + 1}
              </span>
              <span className={`text-[11px] font-semibold ${current ? "text-blue-700" : done ? "text-emerald-600" : "text-gray-400"}`}>
                {label}
              </span>
            </div>
            {i < STEP_LABELS.length - 1 && (
              <div className={`h-0.5 flex-1 rounded ${done ? "bg-emerald-400" : "bg-gray-200"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function RecuperarSenhaPage() {
  const [step, setStep] = useState<Step>("cpf");
  const [cpf, setCpf] = useState("");
  const [firstName, setFirstName] = useState<string | null>(null);
  const [channels, setChannels] = useState<RecoveryChannelInfo[]>([]);
  const [channel, setChannel] = useState<RecoveryChannel>("sms");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);

  const inputClass =
    "h-12 rounded-xl border-gray-200 bg-white text-[15px] shadow-sm focus-visible:ring-2 focus-visible:ring-blue-500/60";

  // Passo 1 → busca os canais disponíveis para o CPF.
  async function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    if (cpf.replace(/\D/g, "").length !== 11) {
      toast.error("Informe um CPF válido (11 dígitos).");
      return;
    }
    setBusy(true);
    try {
      const res = await getRecoveryChannels(cpf);
      if (!res.found) {
        toast.error("CPF não encontrado. Confira os dígitos ou fale com o atendimento.");
        return;
      }
      setFirstName(res.firstName);
      setChannels(res.channels);
      const firstAvailable = res.channels.find((c) => c.available);
      if (!firstAvailable) {
        toast.error("Nenhum canal de envio disponível — fale com o atendimento pelo WhatsApp.");
        return;
      }
      setChannel(firstAvailable.id);
      setStep("canal");
    } catch {
      toast.error("Não foi possível consultar agora. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  // Passo 2 → dispara o código pelo canal escolhido.
  async function handleSend() {
    setBusy(true);
    try {
      const res = await requestPasswordReset(cpf, channel);
      if (res.ok) {
        toast.success(res.message);
        setStep("codigo");
      } else {
        toast.error(res.message);
      }
    } catch {
      toast.error("Não foi possível enviar o código. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  // Passo 3 → valida código e redefine a senha.
  async function handleConfirm(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      toast.error("As senhas não conferem.");
      return;
    }
    setBusy(true);
    try {
      const res = await confirmPasswordReset(cpf, code, password);
      if (res.ok) setStep("pronto");
      else toast.error(res.message);
    } catch {
      toast.error("Não foi possível redefinir a senha. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  const channelMeta: Record<RecoveryChannel, { icon: typeof Smartphone; title: string; hint: string }> = {
    sms: { icon: Smartphone, title: "SMS no celular", hint: "Código por mensagem de texto" },
    email: { icon: Mail, title: "E-mail", hint: "Código na caixa de entrada" },
  };

  return (
    <AuthShell>
      <div className="rounded-3xl border border-gray-100 bg-white p-8 shadow-xl shadow-blue-950/[0.06] sm:p-10">
        {step !== "pronto" && (
          <>
            <div className="mb-6">
              <h1 className="text-2xl font-black tracking-tight text-gray-900">Recuperar senha</h1>
              <p className="mt-1.5 text-sm text-gray-500">
                {step === "cpf" && "Informe seu CPF para localizar o cadastro."}
                {step === "canal" && `${firstName ? `${firstName}, escolha` : "Escolha"} por onde quer receber o código de 6 dígitos.`}
                {step === "codigo" && "Digite o código recebido e defina a nova senha. O código expira em 10 minutos."}
              </p>
            </div>
            <Stepper step={step} />
          </>
        )}

          {step === "cpf" && (
            <motion.form
              key="cpf"
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.2 }}
              onSubmit={handleLookup}
              className="space-y-5"
            >
              <div className="space-y-1.5">
                <Label htmlFor="cpf" className="text-[13px] font-semibold text-gray-700">CPF</Label>
                <div className="relative">
                  <IdCard className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                  <Input
                    id="cpf"
                    inputMode="numeric"
                    autoComplete="username"
                    placeholder="000.000.000-00"
                    value={cpf}
                    onChange={(e) => setCpf(maskCpf(e.target.value))}
                    className={`${inputClass} pl-11`}
                    autoFocus
                  />
                </div>
              </div>
              <Button
                type="submit"
                disabled={busy}
                className="group h-12 w-full rounded-xl bg-gradient-to-r from-blue-700 to-blue-600 text-[15px] font-bold shadow-lg shadow-blue-600/25 hover:from-blue-800 hover:to-blue-700"
              >
                {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : (
                  <>Continuar<ArrowRight className="ml-1.5 h-4 w-4 transition-transform group-hover:translate-x-0.5" /></>
                )}
              </Button>
            </motion.form>
          )}

          {step === "canal" && (
            <motion.div
              key="canal"
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.2 }}
              className="space-y-5"
            >
              <div className="space-y-3" role="radiogroup" aria-label="Canal de envio do código">
                {channels.map((c) => {
                  const meta = channelMeta[c.id];
                  const selected = channel === c.id && c.available;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      disabled={!c.available}
                      onClick={() => c.available && setChannel(c.id)}
                      role="radio"
                      aria-checked={selected}
                      className={`w-full rounded-2xl border-2 p-4 text-left transition-all ${
                        !c.available
                          ? "cursor-not-allowed border-gray-100 bg-gray-50 opacity-60"
                          : selected
                            ? "border-blue-600 bg-blue-50/60 shadow-sm shadow-blue-600/10"
                            : "border-gray-150 border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50/30"
                      }`}
                    >
                      <div className="flex items-center gap-3.5">
                        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                          selected ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-500"
                        }`}>
                          <meta.icon className="h-5 w-5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="text-sm font-bold text-gray-900">{meta.title}</span>
                            {selected && (
                              <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-bold text-white">
                                selecionado
                              </span>
                            )}
                          </span>
                          <span className="block truncate text-sm font-medium text-gray-600">{c.destination}</span>
                          <span className="block text-xs text-gray-400">
                            {c.available ? meta.hint : c.reason}
                          </span>
                        </span>
                        <span
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                            selected ? "border-blue-600" : "border-gray-300"
                          }`}
                        >
                          {selected && <span className="h-2.5 w-2.5 rounded-full bg-blue-600" />}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>

              <Button
                onClick={handleSend}
                disabled={busy || !channels.some((c) => c.id === channel && c.available)}
                className="group h-12 w-full rounded-xl bg-gradient-to-r from-blue-700 to-blue-600 text-[15px] font-bold shadow-lg shadow-blue-600/25 hover:from-blue-800 hover:to-blue-700"
              >
                {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : (
                  <>Enviar código<ArrowRight className="ml-1.5 h-4 w-4 transition-transform group-hover:translate-x-0.5" /></>
                )}
              </Button>

              <button
                type="button"
                onClick={() => setStep("cpf")}
                className="mx-auto flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-gray-700"
              >
                <ArrowLeft className="h-4 w-4" /> Corrigir CPF
              </button>
            </motion.div>
          )}

          {step === "codigo" && (
            <motion.form
              key="codigo"
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.2 }}
              onSubmit={handleConfirm}
              className="space-y-5"
            >
              <div className="space-y-1.5">
                <Label htmlFor="code" className="text-[13px] font-semibold text-gray-700">Código de 6 dígitos</Label>
                <div className="relative">
                  <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                  <Input
                    id="code"
                    inputMode="numeric"
                    placeholder="000000"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    className={`${inputClass} pl-11 text-lg font-bold tracking-[0.4em]`}
                    autoFocus
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-[13px] font-semibold text-gray-700">Nova senha</Label>
                <div className="relative">
                  <LockKeyhole className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="Mínimo de 7 caracteres"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={`${inputClass} pl-11 pr-11`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-gray-400 hover:text-gray-600"
                    aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="confirm" className="text-[13px] font-semibold text-gray-700">Confirmar nova senha</Label>
                <div className="relative">
                  <LockKeyhole className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                  <Input
                    id="confirm"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="Repita a nova senha"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    className={`${inputClass} pl-11`}
                  />
                </div>
              </div>

              <Button
                type="submit"
                disabled={busy || code.length !== 6}
                className="h-12 w-full rounded-xl bg-gradient-to-r from-blue-700 to-blue-600 text-[15px] font-bold shadow-lg shadow-blue-600/25 hover:from-blue-800 hover:to-blue-700"
              >
                {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : "Redefinir senha"}
              </Button>

              <button
                type="button"
                onClick={() => setStep("canal")}
                disabled={busy}
                className="mx-auto block text-sm font-medium text-blue-600 hover:underline disabled:opacity-50"
              >
                Não recebi o código — enviar de novo
              </button>
            </motion.form>
          )}

          {step === "pronto" && (
            <motion.div
              key="pronto"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.25 }}
              className="flex flex-col items-center gap-4 py-4 text-center"
            >
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 ring-8 ring-emerald-50/60">
                <ShieldCheck className="h-8 w-8 text-emerald-500" />
              </span>
              <div>
                <h1 className="text-xl font-black text-gray-900">Senha redefinida!</h1>
                <p className="mt-1 text-sm text-gray-500">
                  Tudo certo{firstName ? `, ${firstName}` : ""}. Agora é só entrar com a nova senha.
                </p>
              </div>
              <Button asChild className="h-12 w-full rounded-xl bg-gradient-to-r from-blue-700 to-blue-600 text-[15px] font-bold shadow-lg shadow-blue-600/25 hover:from-blue-800 hover:to-blue-700">
                <Link href="/login">Ir para o login</Link>
              </Button>
            </motion.div>
          )}

        {step !== "pronto" && (
          <div className="mt-8 border-t border-gray-100 pt-5">
            <Link
              href="/login"
              className="flex items-center justify-center gap-1 text-sm font-medium text-gray-500 hover:text-gray-700"
            >
              <ArrowLeft className="h-4 w-4" /> Voltar para o login
            </Link>
          </div>
        )}
      </div>
    </AuthShell>
  );
}
