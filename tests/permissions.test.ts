import { describe, it, expect } from "vitest";
import {
  isTeamRole,
  resolvePermissions,
  roleDefaults,
  parseOverrides,
  diffFromDefaults,
  PERMISSION_KEYS,
} from "@/app/_shared/lib/permissions";

describe("isTeamRole", () => {
  it("aceita os três cargos da equipe", () => {
    expect(isTeamRole("ADMIN")).toBe(true);
    expect(isTeamRole("ADMIN+")).toBe(true);
    expect(isTeamRole("ADMIN++")).toBe(true);
  });
  it("rejeita cargos de cliente/coluna e vazios", () => {
    expect(isTeamRole("GHOST")).toBe(false);
    expect(isTeamRole("NEGADOS CCS")).toBe(false);
    expect(isTeamRole(null)).toBe(false);
    expect(isTeamRole(undefined)).toBe(false);
  });
});

describe("resolvePermissions", () => {
  it("ADMIN++ tem tudo, sempre (overrides ignorados)", () => {
    const map = resolvePermissions("ADMIN++", { view_archived: false });
    // read_only e dashboard_only são restrições: o Super Admin nunca fica travado.
    const restrictive = new Set(["read_only", "dashboard_only"]);
    for (const key of PERMISSION_KEYS) expect(map[key]).toBe(!restrictive.has(key));
  });

  it("ADMIN começa sem Arquivados/Tickets/Gestor", () => {
    const map = resolvePermissions("ADMIN");
    expect(map.view_archived).toBe(false);
    expect(map.archive_cards).toBe(false);
    expect(map.view_tickets).toBe(false);
    expect(map.manager_dashboard).toBe(false);
    expect(map.manage_team).toBe(false);
  });

  it("override individual concede além do padrão do cargo", () => {
    const map = resolvePermissions("ADMIN", { view_archived: true, archive_cards: true });
    expect(map.view_archived).toBe(true);
    expect(map.archive_cards).toBe(true);
    expect(map.view_tickets).toBe(false);
  });

  it("manage_team NUNCA é concedível por override", () => {
    const map = resolvePermissions("ADMIN+", { manage_team: true });
    expect(map.manage_team).toBe(false);
  });

  it("quem não é da equipe não tem nada", () => {
    const map = resolvePermissions("GHOST", { view_archived: true });
    for (const key of PERMISSION_KEYS) expect(map[key]).toBe(false);
  });
});

describe("operação por IA", () => {
  it("leitura (op_use) liberada para os três cargos", () => {
    for (const role of ["ADMIN", "ADMIN+", "ADMIN++"] as const) {
      expect(resolvePermissions(role).op_use).toBe(true);
    }
  });

  it("escrever é da equipe toda (26/10); aprovar e publicar conhecimento nascem só no ADMIN++", () => {
    for (const role of ["ADMIN", "ADMIN+"] as const) {
      const map = resolvePermissions(role);
      expect(map.op_write).toBe(true);
      expect(map.op_approve).toBe(false);
      expect(map.manage_knowledge).toBe(false);
    }
    const sa = resolvePermissions("ADMIN++");
    expect(sa.op_write && sa.op_approve && sa.manage_knowledge).toBe(true);
  });

  it("op_write é concedível por override", () => {
    expect(resolvePermissions("ADMIN+", { op_write: true }).op_write).toBe(true);
  });
});

describe("parseOverrides", () => {
  it("ignora lixo e chaves desconhecidas", () => {
    expect(parseOverrides(null)).toEqual({});
    expect(parseOverrides("x")).toEqual({});
    expect(parseOverrides([true])).toEqual({});
    expect(parseOverrides({ hacker: true, view_archived: true, archive_cards: "yes" }))
      .toEqual({ view_archived: true });
  });
});

describe("diffFromDefaults", () => {
  it("retorna null quando o mapa é igual ao padrão do cargo", () => {
    expect(diffFromDefaults("ADMIN", roleDefaults("ADMIN"))).toBeNull();
  });

  it("grava só o que difere do padrão", () => {
    const edited = { ...roleDefaults("ADMIN"), view_archived: true };
    expect(diffFromDefaults("ADMIN", edited)).toEqual({ view_archived: true });
  });

  it("nunca inclui manage_team", () => {
    const edited = { ...roleDefaults("ADMIN"), manage_team: true };
    expect(diffFromDefaults("ADMIN", edited)).toBeNull();
  });
});
