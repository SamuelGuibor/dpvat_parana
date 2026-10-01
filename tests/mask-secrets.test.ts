import { describe, expect, it } from "vitest";
import {
  CODE_MASK, PASSWORD_MASK, maskMemorySecrets, maskSecrets, maskSecretsInSequence,
} from "@/app/_shared/utils/mask-secrets";

// Rede de segurança de senha/código (decisão do dono, 30/09/2026): o valor não
// vai à IA (histórico do /reply e do cron), nem ao snapshot do S3, nem à
// destilação. CPF, data, valor e telefone fora desse contexto ficam intactos.

describe("maskSecrets — palavra-chave + valor", () => {
  it("senha com 'é', com ':' e com '='", () => {
    expect(maskSecrets("minha senha é Abc@1234")).toBe(`minha senha é ${PASSWORD_MASK}`);
    expect(maskSecrets("senha: 123456")).toBe(`senha: ${PASSWORD_MASK}`);
    expect(maskSecrets("senha=Maria2020")).toBe(`senha=${PASSWORD_MASK}`);
    expect(maskSecrets("Senha 12031980")).toBe(`Senha ${PASSWORD_MASK}`);
    expect(maskSecrets("minha senha eh abc#def")).toBe(`minha senha eh ${PASSWORD_MASK}`);
  });

  it("senha do gov / gov.br / meu INSS e password", () => {
    expect(maskSecrets("a senha do gov é Maria@2024")).toBe(`a senha do gov é ${PASSWORD_MASK}`);
    expect(maskSecrets("senha gov.br: Joao#1980")).toBe(`senha gov.br: ${PASSWORD_MASK}`);
    expect(maskSecrets("a senha do meu inss é 12345678")).toBe(`a senha do meu inss é ${PASSWORD_MASK}`);
    expect(maskSecrets("password: Xy9!abcd")).toBe(`password: ${PASSWORD_MASK}`);
  });

  it("código / codigo / token", () => {
    expect(maskSecrets("o código é 482913")).toBe(`o código é ${CODE_MASK}`);
    expect(maskSecrets("codigo 482913")).toBe(`codigo ${CODE_MASK}`);
    expect(maskSecrets("código de verificação: 120394")).toBe(`código de verificação: ${CODE_MASK}`);
    expect(maskSecrets("código da ZapSign 5521")).toBe(`código da ZapSign ${CODE_MASK}`);
    expect(maskSecrets("token=ab12cd34")).toBe(`token=${CODE_MASK}`);
  });

  it("preserva pontuação e aspas em volta do valor", () => {
    expect(maskSecrets("minha senha é Abc@1234.")).toBe(`minha senha é ${PASSWORD_MASK}.`);
    expect(maskSecrets('a senha é "Abc@1234", ok?')).toBe(`a senha é "${PASSWORD_MASK}", ok?`);
  });

  it("senha e código na mesma mensagem", () => {
    expect(maskSecrets("senha do gov é Maria@2024 e o código 482913")).toBe(
      `senha do gov é ${PASSWORD_MASK} e o código ${CODE_MASK}`,
    );
  });

  it("fala sobre senha sem o valor não mascara nada", () => {
    for (const text of [
      "a senha do gov não funciona",
      "esqueci a senha",
      "minha senha do gov.br",
      "não sei a senha do INSS",
      "o código não chegou",
      "vou mandar o código depois",
      "senha e código eu passo amanhã",
    ]) {
      expect(maskSecrets(text)).toBe(text);
    }
  });
});

describe("maskSecrets — letra + dígito numa mensagem sobre senha", () => {
  it("pega a senha mesmo com palavras no meio", () => {
    expect(maskSecrets("minha senha nova é Maria2020")).toBe(`minha senha nova é ${PASSWORD_MASK}`);
    expect(maskSecrets("a senha que eu uso no gov é joao1980!")).toBe(`a senha que eu uso no gov é ${PASSWORD_MASK}!`);
  });

  it("não mexe em CPF, e-mail nem link na mensagem sobre senha", () => {
    const text = "senha eu não tenho, meu cpf 123.456.789-00 e email joao1980@gmail.com";
    expect(maskSecrets(text)).toBe(text);
    const link = "a senha fica no link https://app.zapsign.com.br/verificar/ab12cd34";
    expect(maskSecrets(link)).toBe(link);
  });
});

describe("maskSecrets — dígitos soltos numa mensagem sobre código/gov/ZapSign", () => {
  it("mascara 4 a 8 dígitos soltos", () => {
    expect(maskSecrets("chegou o 482913 no SMS")).toBe(`chegou o ${CODE_MASK} no SMS`);
    expect(maskSecrets("o código que chegou foi 482913")).toBe(`o código que chegou foi ${CODE_MASK}`);
    expect(maskSecrets("zapsign mandou 5521 aqui")).toBe(`zapsign mandou ${CODE_MASK} aqui`);
  });

  it("ano, data, CPF, valor e telefone formatado continuam no contexto de código", () => {
    for (const text of [
      "o código chegou dia 12/03/2024",
      "entrei no gov em 2019 e trabalhei até 2021",
      "código não chegou, meu CPF é 123.456.789-00",
      "o código custa R$ 1.234,56?",
      "o código custa R$ 1500",
      "manda o código no (41) 99786-2323",
      "o código do benefício é 6300159837",
    ]) {
      expect(maskSecrets(text)).toBe(text);
    }
  });

  it("não mexe em dígitos dentro de link", () => {
    const text = "o código está em https://app.zapsign.com.br/doc?id=482913";
    expect(maskSecrets(text)).toBe(text);
  });
});

describe("maskSecrets — sem contexto de senha/código nada muda", () => {
  it("CPF, valor, data, telefone e números soltos", () => {
    for (const text of [
      "CPF 123.456.789-00",
      "R$ 1.234,56",
      "dia 12/03/2024",
      "meu telefone é (41) 99786-2323",
      "41 99786 2323",
      "o acidente foi em 2023 e fiquei 45 dias afastado",
      "moro na rua 1234",
      "número do benefício 630.015.983-7",
      "",
    ]) {
      expect(maskSecrets(text)).toBe(text);
    }
  });
});

describe("maskSecrets — resposta à pergunta anterior", () => {
  it("token solto com cara de senha depois de falar em senha", () => {
    expect(maskSecrets("Abc@1234", "Qual a sua senha do gov?")).toBe(PASSWORD_MASK);
    expect(maskSecrets("  maria2020 ", "me passa a senha")).toBe(`  ${PASSWORD_MASK} `);
    expect(maskSecrets("12031980", "qual a senha do Meu INSS?")).toBe(PASSWORD_MASK);
  });

  it("depois de falar em senha, CPF/data/e-mail/resposta comum não mascaram", () => {
    expect(maskSecrets("123.456.789-00", "me passa seu CPF e a senha")).toBe("123.456.789-00");
    expect(maskSecrets("12345678900", "me passa seu CPF e a senha")).toBe("12345678900");
    expect(maskSecrets("12/03/1980", "qual a senha?")).toBe("12/03/1980");
    expect(maskSecrets("joao@gmail.com", "e-mail e senha?")).toBe("joao@gmail.com");
    expect(maskSecrets("ok", "não precisa me passar a senha")).toBe("ok");
    expect(maskSecrets("Obrigado!", "não precisa me passar a senha")).toBe("Obrigado!");
  });

  it("dígitos soltos depois de perguntar o código", () => {
    expect(maskSecrets("482913", "Qual o código que chegou no SMS?")).toBe(CODE_MASK);
    expect(maskSecrets("chegou sim 482913", "o código chegou?")).toBe(`chegou sim ${CODE_MASK}`);
    // Sem pergunta de código antes, número solto fica.
    expect(maskSecrets("482913", "Qual o número da sua casa?")).toBe("482913");
  });

  it("a mensagem anterior já mascarada não conta como pergunta", () => {
    expect(maskSecrets("maria2020", `minha senha é ${PASSWORD_MASK}`)).toBe(PASSWORD_MASK);
    expect(maskSecrets("maria2020", PASSWORD_MASK)).toBe("maria2020");
  });
});

describe("maskSecrets — idempotência", () => {
  it("texto já mascarado passa sem mudar", () => {
    for (const text of [
      "minha senha é Abc@1234",
      "o código é 482913",
      "senha do gov é Maria@2024 e o código 482913",
      "chegou o 482913 no SMS",
    ]) {
      const once = maskSecrets(text);
      expect(maskSecrets(once)).toBe(once);
    }
  });
});

describe("maskSecretsInSequence", () => {
  it("cada mensagem olha a anterior (texto original)", () => {
    expect(maskSecretsInSequence(["qual a sua senha do gov?", "Abc@1234", "ok, obrigado"])).toEqual([
      "qual a sua senha do gov?",
      PASSWORD_MASK,
      "ok, obrigado",
    ]);
    expect(maskSecretsInSequence(["482913"], "o código chegou?")).toEqual([CODE_MASK]);
    expect(maskSecretsInSequence([])).toEqual([]);
  });

  it("a pergunta vale por 3 mensagens: 'segue'/'chegou agora' no meio não solta a senha nem o código", () => {
    expect(maskSecretsInSequence(["Me manda a sua senha do gov.br pra eu entrar", "segue", "Abc@1234"])).toEqual([
      "Me manda a sua senha do gov.br pra eu entrar",
      "segue",
      PASSWORD_MASK,
    ]);
    expect(maskSecretsInSequence(["Qual o código que chegou no SMS?", "chegou agora", "482913"])).toEqual([
      "Qual o código que chegou no SMS?",
      "chegou agora",
      CODE_MASK,
    ]);
    // Contexto inicial em lista (histórico anterior ao trecho).
    expect(maskSecretsInSequence(["Abc@1234"], ["qual a sua senha?", "pera", "achei"])).toEqual([PASSWORD_MASK]);
  });

  it("depois de 3 mensagens a pergunta não conta mais", () => {
    expect(maskSecretsInSequence(["qual a sua senha?", "a", "b", "c", "Abc@1234"]).at(-1)).toBe("Abc@1234");
  });
});

describe("maskSecrets — lote com várias linhas (regra 4 por linha)", () => {
  it("'segue' + senha no mesmo lote, depois da pergunta", () => {
    expect(maskSecrets("segue\nAbc@1234", "Me manda a sua senha do gov.br")).toBe(`segue\n${PASSWORD_MASK}`);
    expect(maskSecrets("segue\nAbc@1234", ["Me manda a sua senha do gov.br", "ok"])).toBe(`segue\n${PASSWORD_MASK}`);
  });

  it("linha anterior do mesmo lote que fala de senha vale como pergunta", () => {
    expect(maskSecrets("vou mandar a senha\nAbc@defg")).toBe(`vou mandar a senha\n${PASSWORD_MASK}`);
  });

  it("linha com frase não é tratada como senha", () => {
    expect(maskSecrets("segue\nok obrigado", "qual a sua senha?")).toBe("segue\nok obrigado");
  });
});

describe("maskSecrets — senha de letras e senha com espaço (separador explícito)", () => {
  it("valor só de letras depois de 'senha:'/'senha é'", () => {
    expect(maskSecrets("Senha gov: abcdefgh")).toBe(`Senha gov: ${PASSWORD_MASK}`);
    expect(maskSecrets("minha senha é maria")).toBe(`minha senha é ${PASSWORD_MASK}`);
    expect(maskSecrets("a senha era joaquim.")).toBe(`a senha era ${PASSWORD_MASK}.`);
  });

  it("senha com espaço junta número e palavra com maiúscula da mesma linha", () => {
    expect(maskSecrets("minha senha do gov é Maria 2020")).toBe(`minha senha do gov é ${PASSWORD_MASK}`);
    expect(maskSecrets("Minha senha é Maria 2020 Nova")).toBe(`Minha senha é ${PASSWORD_MASK}`);
    expect(maskSecrets("senha: 1234 5678")).toBe(`senha: ${PASSWORD_MASK}`);
    // Para na palavra comum, na pontuação e em outra palavra-chave.
    expect(maskSecrets("senha: Abc@1234 e o código 482913")).toBe(`senha: ${PASSWORD_MASK} e o código ${CODE_MASK}`);
    expect(maskSecrets("senha: Maria2020, cpf 123.456.789-00")).toBe(`senha: ${PASSWORD_MASK}, cpf 123.456.789-00`);
  });

  it("palavra comum depois de 'senha é' não é senha (bot, atendente e ficha passam pela mesma regra)", () => {
    for (const text of [
      "a senha é errada",
      "a senha é pessoal, não mande por aqui",
      "Senha gov: esqueceu",
      "Senha do gov: não tem",
      "minha senha é muito difícil",
      "a senha é a mesma do email",
      "senha e código eu passo amanhã",
      "a senha do meu email é abc",
    ]) {
      expect(maskSecrets(text)).toBe(text);
    }
  });

  it("sem separador explícito, senha só de letras passa (lacuna aceita)", () => {
    expect(maskSecrets("minha senha maria")).toBe("minha senha maria");
  });
});

describe("maskMemorySecrets — ficha linha a linha", () => {
  it("mascara a senha da linha dela sem tocar CEP/RG das outras", () => {
    const memory = "Nome: Ana Lima\nTem gov.br: sim\nSenha gov: Maria2020\nCEP: 80010000\nRG 12345678";
    expect(maskMemorySecrets(memory)).toBe(
      `Nome: Ana Lima\nTem gov.br: sim\nSenha gov: ${PASSWORD_MASK}\nCEP: 80010000\nRG 12345678`,
    );
    // A ficha inteira de uma vez mascararia o CEP como código (o motivo do linha a linha).
    expect(maskSecrets(memory)).toContain(CODE_MASK);
  });

  it("vazio e idempotente", () => {
    expect(maskMemorySecrets(null)).toBeNull();
    expect(maskMemorySecrets("")).toBe("");
    const once = maskMemorySecrets("Senha gov: Maria2020");
    expect(maskMemorySecrets(once)).toBe(once);
  });
});
