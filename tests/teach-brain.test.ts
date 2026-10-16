import { describe, expect, it } from 'vitest';
import { locateRule, numberRules, parseTeachAnalysis } from '@/app/_shared/utils/teach-brain';

const sections = [
  { name: 'Triagem', rules: [{ text: 'a' }, { text: 'b' }] },
  { name: 'Mídia', rules: [{ text: 'c' }] },
];

describe('teach-brain', () => {
  it('numera R1..Rn igual ao renderPlaybook', () => {
    expect(numberRules(sections).map((r) => r.id)).toEqual(['R1', 'R2', 'R3']);
    expect(locateRule(sections, 'R3')).toEqual({ sectionIndex: 1, ruleIndex: 0 });
    expect(locateRule(sections, 'R9')).toBeNull();
  });

  it('descarta ids que não existem e rebaixa reforço sem alvo', () => {
    const rules = numberRules(sections);
    const out = parseTeachAnalysis(
      'lixo {"existing":[{"id":"R7"}],"botActions":[{"what":"x","verdict":"contrariou","ruleId":"R7"}],"recommendation":"reforcar","proposedText":"y"}',
      rules,
    );
    expect(out?.existing).toEqual([]);
    expect(out?.botActions[0].ruleId).toBeUndefined();
    expect(out?.recommendation).toBe('nova');
  });

  it('reforço válido mantém o alvo', () => {
    const out = parseTeachAnalysis('{"existing":[{"id":"R3","relation":"igual"}],"recommendation":"reforcar","targetRuleId":"R3","proposedText":"z"}', numberRules(sections));
    expect(out?.targetRuleId).toBe('R3');
    expect(out?.existing[0].section).toBe('Mídia');
  });

  it('JSON ilegível → null', () => {
    expect(parseTeachAnalysis('sem json', [])).toBeNull();
  });
});
