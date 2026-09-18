# Stockai

Gestão de recebimento e estoque para grupos de restaurantes. A primeira etapa implementa o percurso **cadastro manual da nota → conferência cega → revisão de divergência → entrada física e crédito com fornecedor**, com persistência real em Supabase.

## Banco definido para o Stockai

Projeto remoto: `kph-os-dev` (`iqgrvptrtphvbmvrqntm`), escolhido pelo usuário. A conexão ativa em `apps/web/.env.local` usa `https://iqgrvptrtphvbmvrqntm.supabase.co` e sua chave publicável. As 10 tabelas e 5 RPCs públicas são exclusivas do Stockai, com prefixo `stockai_`; as funções internas ficam em `stockai_private`. Nenhuma tabela dos outros sistemas foi reaproveitada ou alterada. A autenticação é a do projeto existente; o usuário de demonstração local não foi criado remotamente.

A migração inicial foi aplicada por `apply_migration` com nome `stockai_foundation`. Como o projeto tem histórico de outros sistemas, **não executar `supabase db push`, `db reset --linked` nem reparar o histórico remoto a partir deste repositório**. Próximas migrações devem ser revisadas e aplicadas individualmente, apenas para objetos `stockai_`.

## Executar com o banco remoto

```sh
pnpm install
pnpm dev --port 3100
```

Use uma conta do projeto Supabase escolhido. No primeiro acesso ao Stockai, cadastre sua empresa com nome fantasia, razão social e CNPJ. Os testes integrados de banco são exclusivos do ambiente local.

## Desenvolvimento isolado local

Requisitos: Node.js 22+, pnpm 11.5.2, Docker e Supabase CLI 2.104.0 ou superior.

```sh
pnpm install
supabase start
node scripts/setup-local.mjs --switch-to-local
pnpm dev --port 3100
```

- Operação: http://127.0.0.1:3100
- Demonstração independente: http://127.0.0.1:3100/demo
- Acesso exclusivamente local: `gestor@stockai.local` / `Stockai.local.2026`

O script local recusa hosts remotos e escreve somente a URL e a chave publicável no `.env.local`. A chave administrativa local é usada para criar o usuário de desenvolvimento e não é gravada no aplicativo. No primeiro acesso, cadastre a primeira empresa. Não use o usuário de desenvolvimento em produção.

Sem Supabase, `/demo` funciona com exemplos persistidos no navegador. `/operacao` exige autenticação e usa o banco; nunca cai silenciosamente para dados de demonstração.

## Implementado

- Monorepo pnpm, Next.js 15, React, TypeScript estrito, validação Zod e domínio sem I/O.
- Login, renovação de sessão, logout e cadastro obrigatório da primeira empresa e gestão de empresas em `/empresas`.
- 10 tabelas com RLS, papéis por unidade, validade/revogação de associação e chaves estrangeiras compostas para impedir vínculos entre organizações.
- Recebimento manual com identificação da nota, fornecedor e itens, criação idempotente, detecção de nota duplicada.
- Conferência de falta, excesso e item não entregue; divergência exige aprovação; recebimento conforme fecha automaticamente.
- Fiscal imutável; físico contado; financeiro limitado ao faturado, descontando faltas. Valores em centavos, quantidades `numeric(14,4)`.
- Fechamento transacional: movimentação, crédito e auditoria gravados juntos. Travamento do recebimento impede duas aprovações de gerarem entradas duplicadas.
- Movimentações e auditoria imutáveis. Não há edição destrutiva de estoque pela aplicação.
- Rota `/conferencia/[id]` autenticada retorna apenas identificação dos itens e unidade de medida. Operadores não recebem preços nem quantidades esperadas no payload.
- Painel, filtros, busca, fornecedores, fila de aprovação, CSV e entradas confirmadas, responsivos.
- Testes de domínio, integração SQL, navegador e CI.

## Limites desta etapa

Esta é uma primeira fatia funcional do produto, **não a implementação integral da especificação**. WhatsApp, IA, NF-e/SEFAZ, evidências de qualidade/temperatura, magic links, Realtime/push, importação, receitas/CMV, PDV e compras ainda não estão implementados. O detalhamento está em [docs/roadmap.md](docs/roadmap.md).

O painel considera até os 500 recebimentos mais recentes visíveis ao usuário. A tela de estoque exibe entradas confirmadas; ainda não é saldo operacional, pois saídas, perdas, inventário e estorno não têm fluxo implementado. A estrutura reserva o vínculo de estorno, mas não expõe uma operação de estorno incompleta. Créditos são calculados e criados no fechamento; liquidação e documento de cobrança ainda não têm interface.

O onboarding cria o grupo de acesso e sua primeira empresa. Cada empresa destinatária corresponde a um estabelecimento com CNPJ, armazenado em `stockai_units`; novas empresas podem ser cadastradas pelo gestor do grupo. Notas exigem uma empresa cadastrada e usam seu ID como vínculo. O CNPJ tem validação de formato (sem consulta cadastral externa) e não pode ser trocado após receber notas. Gestão de equipes, convites e a tela de trabalho de operadores ficam para a próxima etapa. A rota de conferência dedicada já aplica a proteção no servidor; a visão do gestor recebe os dados fiscais para revisão. Os insumos manuais usam KG/L/UN; conversão de embalagens está testada no domínio, mas o cadastro de embalagens ainda não foi conectado.

## Validação

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm test:db
STOCKAI_TEST_DATABASE=1 pnpm test:e2e
pnpm build
```

Os testes SQL usam transação com rollback. Os testes de navegador com banco criam recebimentos na organização local de testes. Não execute o script de conta local em ambientes reais. O CI cria um Supabase descartável e exige testes de isolamento antes do build.

## Estrutura

```text
apps/web/          Interface, autenticação, API e validação de entrada
packages/core/     Regras puras de recebimento e conversão
packages/db/       Migrações e tipos gerados do banco
supabase/          Configuração local, ligação para migrações e testes SQL
tests/e2e/         Percursos reais de navegador
scripts/           Preparação do ambiente exclusivamente local
docs/              Escopo e próximas etapas
```

Migrações vivem em `packages/db/migrations`, com symlink em `supabase/migrations`. Tipos são gerados pelo CLI, nunca mantidos manualmente:

```sh
supabase gen types --local --schema public > packages/db/types/database.ts
```

O projeto remoto escolhido pelo usuário recebeu somente objetos exclusivos do Stockai. Para hospedagem do front, configurar `APP_ORIGIN`, autenticação e variáveis de ambiente, aplicar migrações versionadas e repetir a validação. A primeira entrega não deve receber dados de clientes antes de concluir as etapas de produção do roadmap.
