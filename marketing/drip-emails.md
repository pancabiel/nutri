# Drip de email — Nutri (pt-BR)

Sequência de 6 emails que dispara a partir do signup no Supabase Auth. Objetivo: levar o usuário do AHA moment (D0) até a conversão pra Pro (D7) e renovação anual (D30).

**Provedor recomendado:** Loops (free até 1k contatos, editor visual de drip, integração nativa com Supabase). Alternativa: Resend Broadcasts (mais técnico).

**Variáveis Loops** (Liquid): `{{firstName}}`, `{{email}}`. Se o nome não existir (login com email/magic link sem nome), fallback é texto neutro.

**Endereço de remetente:** `Gabriel do Nutri <oi@nutri.app.br>` (configurar SPF/DKIM no domínio antes — Loops gera as DNS records).

**App URL nos CTAs:** `https://nutri.pancabiel.workers.dev` (substituir quando tiver domínio final). Use UTM em todos: `?utm_source=loops&utm_medium=email&utm_campaign=drip&utm_content=<email-name>`.

---

## D0 — Boas-vindas + push pro AHA moment

- **Quando:** 0 minutos após signup
- **Subject:** Bem-vindo ao Nutri 🥗
- **Preview text:** Tira foto do seu próximo prato — é mágico.

```
Olá{{#if firstName}} {{firstName}}{{/if}},

Obrigado por testar o Nutri.

Eu construí esse app porque cansei de buscar "pão francês" no MyFitnessPal toda manhã. Aqui você só fala — ou tira uma foto — e a IA faz o resto.

Pra ver a mágica acontecer, faz isso agora:

  → Tira foto do seu próximo almoço ou jantar
  → A IA quebra em itens e te mostra as calorias

Foto da câmera, em 5 segundos. Sem buscar nada.

Abre aqui: https://nutri.pancabiel.workers.dev/?utm_source=loops&utm_medium=email&utm_campaign=drip&utm_content=d0-welcome

Se algo não funcionou ou ficou estranho, responde esse email — chega direto em mim.

Gabriel
Criador do Nutri
```

---

## D2 — Scan de rótulo (segunda feature mágica)

- **Quando:** 2 dias após signup
- **Condição:** enviar para todos (mesmo quem já testou)
- **Subject:** Já testou o scanner de rótulo?
- **Preview text:** Aponta a câmera pra qualquer embalagem. 5 segundos.

```
Oi{{#if firstName}} {{firstName}}{{/if}},

Tem uma coisa que ninguém testa no primeiro dia: o scan de rótulo.

Funciona assim:
  1. Abre a aba "Produtos" no app
  2. Toca em "+" e escolhe "Scan de rótulo"
  3. Aponta a câmera pra tabela nutricional de qualquer produto do mercado
  4. Ele cadastra na sua base pessoal automaticamente

Depois disso, é só falar "comi 30g do meu cereal" no chat e ele já sabe o que é.

Mais útil pra:
  • Pão integral, granola, iogurte, suplementos
  • Coisa de marca que muda a cada mercado
  • Receitas embaladas (lasanha, hambúrguer congelado)

Tenta agora: https://nutri.pancabiel.workers.dev/?utm_source=loops&utm_medium=email&utm_campaign=drip&utm_content=d2-rotulo

Gabriel
```

---

## D5 — Reforço de hábito + framing pra Pro

- **Quando:** 5 dias após signup
- **Subject:** Como tá indo o registro?
- **Preview text:** A consistência vale mais que a precisão.

```
{{#if firstName}}{{firstName}}, {{/if}}vou te dar um conselho que dou pra todo mundo:

Anotar consistentemente é mais importante que anotar perfeitamente.

Mesmo que erre 10% na estimativa de calorias de um prato, se você anota TODO DIA por 4 semanas, vê padrão. E padrão é o que muda dieta.

(Pesar tudo no grama, todo dia, por anos? Quase ninguém aguenta. Por isso MFP é o app com a maior taxa de abandono do mundo.)

A ideia do Nutri é justamente diminuir o atrito ao mínimo. 5 segundos por refeição. Sem digitar grama.

Continua firme. Abre o app: https://nutri.pancabiel.workers.dev/?utm_source=loops&utm_medium=email&utm_campaign=drip&utm_content=d5-habito

Gabriel
```

---

## D7 — Pitch direto do Pro

- **Quando:** 7 dias após signup
- **Condição (se Loops permitir):** não enviar pra quem já é Pro (`is_pro = true` via webhook reverso quando você implementar)
- **Subject:** R$ 14,90/mês — vale 5 cafés
- **Preview text:** Sem limite de chats. 10 fotos por dia.

```
{{#if firstName}}{{firstName}}, {{/if}}já passou uma semana.

Se você usou e gostou, o Pro tira o limite:

  • 20 análises por chat / dia
  • 10 fotos de prato / dia
  • 10 scans de rótulo / dia
  • R$ 14,90/mês ou R$ 119/ano (33% off)

Pra referência, MFP Premium no Brasil custa R$ 49,90.

Sem fidelidade. Cancela direto no app. Acesso continua até o fim do mês pago.

Assinar: https://nutri.pancabiel.workers.dev/?utm_source=loops&utm_medium=email&utm_campaign=drip&utm_content=d7-pitch

Se você não está pronto, sem stress — responde esse email me contando o que faltou. Cada resposta me ajuda a melhorar o app.

Gabriel
```

---

## D14 — Caso de uso / depoimento

- **Quando:** 14 dias após signup
- **Condição (se Loops permitir):** não enviar pra Pro
- **Subject:** Como [nome] perdeu 5kg em 30 dias
- **Preview text:** Sem dieta restritiva. Sem nutricionista.

> **Nota:** trocar o nome/história abaixo por um depoimento real assim que tiver. Por enquanto, framing genérico que ressoa com a persona.

```
{{#if firstName}}{{firstName}}, {{/if}}quero te contar um padrão que vejo nos usuários que ficam.

A maioria começa achando que o ponto é "saber as calorias do que comeu". É um sintoma, não a causa.

O que realmente muda dieta é descobrir DUAS coisas:
  1. Quanto você come quando "come pouco" (geralmente muito mais do que pensa)
  2. Onde o dia descarrila (lanche da tarde? cerveja no fim de semana?)

Quem registra 21 dias seguidos vê isso. Sem ler nenhum livro, sem nutricionista, sem dieta nova. Os pontos cegos aparecem sozinhos.

O Pro é o que te dá folga de cap pra registrar todo dia sem se preocupar:

Assinar: https://nutri.pancabiel.workers.dev/?utm_source=loops&utm_medium=email&utm_campaign=drip&utm_content=d14-padrao

Gabriel
```

---

## D30 — Oferta anual

- **Quando:** 30 dias após signup
- **Condição (se Loops permitir):** não enviar pra Pro
- **Subject:** Última coisa: R$ 119 no ano (R$ 9,90/mês)
- **Preview text:** Vou parar de te encher por email. Mas antes:

```
{{#if firstName}}{{firstName}}, {{/if}}é o último email do meu lado.

Se chegou até aqui sem assinar, provavelmente o mensal não fez sentido. Faz mais barato:

  • Anual: R$ 119/ano — equivale a R$ 9,90/mês
  • 33% de desconto em relação ao mensal
  • Tudo do Pro: 20 chats/dia, 10 fotos, 10 scans

Vc paga uma vez, esquece por 12 meses.

Assinar anual: https://nutri.pancabiel.workers.dev/?utm_source=loops&utm_medium=email&utm_campaign=drip&utm_content=d30-anual

Se não for pra ti, beleza. A conta grátis continua aberta — volta quando quiser.

Gabriel
```

---

# Roteiro Loops — setup do drip

Pré-requisitos:
- Conta Loops em [loops.so](https://loops.so) (free tier dá 1k contatos / 2k emails/mês)
- Domínio `nutri.app.br` (ou o que você escolher) com acesso ao DNS — pra configurar SPF/DKIM
- Acesso ao Supabase Dashboard

## 1. Criar conta e domínio

1. Sign up em [loops.so](https://loops.so) com `pancabiel@gmail.com`
2. **Settings → Domains → Add domain** → `nutri.app.br`
3. Loops mostra 3-4 DNS records (SPF, DKIM, return-path). Adiciona todos no painel do registrador do domínio.
4. Aguarda verificação (~15min a algumas horas). Loops envia email quando aprovado.
5. **Settings → Email** → "From name" = `Gabriel do Nutri`, "From email" = `oi@nutri.app.br`

## 2. Criar a sequência (Loop)

1. **Loops → + New Loop** → escolhe template "Onboarding sequence" (ou em branco)
2. Renomeia pra `Nutri — Onboarding drip pt-BR`
3. **Trigger:** "Contact added" + filtra por `source = supabase_signup` (você seta isso no passo 4)
4. Adiciona 6 emails na sequência, um por um:
   - **Email 1:** delay = `0 minutes`, subject = `Bem-vindo ao Nutri 🥗`, cola corpo do D0
   - **Email 2:** delay = `2 days`, subject = `Já testou o scanner de rótulo?`, cola D2
   - **Email 3:** delay = `5 days from previous`, cola D5
   - **Email 4:** delay = `2 days from previous`, cola D7 — adiciona filtro **"Skip if `is_pro = true`"** (criar prop `is_pro` antes — passo 5)
   - **Email 5:** delay = `7 days from previous`, cola D14 — mesmo filtro `is_pro`
   - **Email 6:** delay = `16 days from previous`, cola D30 — mesmo filtro `is_pro`
5. **Audience → Properties → + New property** → name = `is_pro`, type = `boolean`, default = `false`
6. **Publish** (botão no canto superior direito)

## 3. Conectar Supabase ao Loops

Opção mais simples — **trigger via Edge Function do Supabase no evento `auth.users` insert**:

1. Loops → **Settings → API** → copia a `API key` (começa com `loops_...`)
2. Supabase Dashboard → **Database → Webhooks → Create a new hook**
   - Name: `loops-signup-trigger`
   - Table: `auth.users`
   - Events: `Insert`
   - Type: `HTTP Request`
   - URL: `https://app.loops.so/api/v1/contacts/create`
   - Method: `POST`
   - HTTP Headers:
     - `Authorization: Bearer <LOOPS_API_KEY>`
     - `Content-Type: application/json`
   - HTTP Params: deixa vazio
   - Body (template):
     ```json
     {
       "email": "{{ record.email }}",
       "firstName": "{{ record.raw_user_meta_data.full_name }}",
       "source": "supabase_signup",
       "userId": "{{ record.id }}"
     }
     ```
3. **Confirm** e cria o webhook.
4. Teste: cria uma conta nova no app → confirma que aparece em Loops > Audience.

*(Alternativa, se webhook do Supabase der trabalho:* Loops tem SDK Node que pode ser chamado a partir do backend Quarkus no fluxo de profile create — mas é mais código. Recomendo webhook do Supabase.)

## 4. Marcar `is_pro` nos contatos (opcional, mas evita spam pós-conversão)

Quando o `BillingService` recebe o webhook do Stripe e flipa `is_pro = true`, dispara também uma chamada pra Loops:

```
POST https://app.loops.so/api/v1/contacts/update
Authorization: Bearer <LOOPS_API_KEY>
Content-Type: application/json

{
  "email": "<user_email>",
  "is_pro": true
}
```

Adicionar essa chamada no `BillingService.handleSubscriptionUpdate` (best-effort, swallow erros — não pode quebrar o webhook do Stripe). Próximo TODO de backend, não bloqueante pra ativar o drip.

## 5. Smoke test

1. Cria conta de teste com email novo
2. Em < 1 minuto chega o D0 no inbox
3. Depois confirma que o contato em Loops mostra a sequência ativa com timestamps corretos pros próximos emails
4. Pra acelerar teste dos próximos: Loops → contato → "Trigger next email manually"

## 6. Métricas que importam

Loops mostra por email: **delivered / opened / clicked / unsubscribed**. Alvo realista pra drip transacional B2C pt-BR:
- Open rate > 30% nos primeiros 3 emails (cai naturalmente nos últimos)
- Click rate > 5% no D0 (CTA pro app)
- Click rate > 3% no D7 (CTA pro Pro)
- Conversão D7 → Pro = principal número a otimizar

Se D0 open < 20%: problema de entregabilidade (DNS, sender reputation). Se D7 click < 1%: pitch tá fraco — reescreve.
