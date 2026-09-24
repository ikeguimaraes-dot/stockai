# Stockai

Gestão de recebimento e estoque para grupos de restaurantes. A primeira etapa implementa o percurso **cadastro manual da nota → conferência de quantidades → revisão de divergência → entrada física e crédito com fornecedor**, com persistência real em Supabase.

## Banco definido para o Stockai

Projeto remoto: `kph-os-dev` (`iqgrvptrtphvbmvrqntm`), escolhido pelo usuário. A conexão ativa em `apps/web/.env.local` usa `https://iqgrvptrtphvbmvrqntm.supabase.co` e sua chave publicável. As tabelas e RPCs do aplicativo são exclusivas do Stockai, com prefixo `stockai_`; as funções internas ficam em `stockai_private`. Nenhuma tabela dos outros sistemas foi reaproveitada ou alterada. A autenticação é a do projeto existente; o usuário de demonstração local não foi criado remotamente.

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
- Tabelas com RLS, papéis por unidade, validade/revogação de associação e chaves estrangeiras compostas para impedir vínculos entre organizações.
- Recebimento manual com identificação da nota, fornecedor e itens, criação idempotente, detecção de nota duplicada.
- Importação de XML de NF-e modelo 55, leiaute 4.00, com protocolo de autorização informado no arquivo. Envio em lote sem limite de quantidade, processamento sequencial e fila persistente em `/identificacao`. Arquivos sem vínculo ou com erro de leitura permanecem salvos para revisão; limite de 1 MB por arquivo UTF-8. A destinatária é identificada pelo CNPJ, a chave é única por empresa e o XML original é imutável.
- Produtos com código interno exclusivo por grupo, categorias e classificação de CMV. Vínculos por grupo, CNPJ do fornecedor, código e unidade comercial reutilizam o produto e o fator de conversão nas próximas notas.
- Edição de notas em `/notas/[id]`, inclusive concluídas. Cada correção cria uma revisão com motivo e snapshots; movimentos anteriores são estornados e substituídos transacionalmente. Edições antes do fechamento reiniciam a conferência. O XML original permanece disponível para download.
- Conferência de falta, excesso e item não entregue; divergência exige aprovação; recebimento conforme fecha automaticamente.
- XML original imutável e histórico das revisões operacionais; físico contado; crédito por faltas limitado ao valor faturado. Valores em centavos, quantidades `numeric(14,4)`.
- Fechamento transacional: movimentação, crédito e auditoria gravados juntos. Travamento do recebimento impede duas aprovações de gerarem entradas duplicadas.
- Movimentações e auditoria imutáveis. Não há edição destrutiva de estoque pela aplicação.
- Rota `/conferencia/[id]` autenticada retorna apenas identificação dos itens e unidade de medida. Operadores não recebem preços nem quantidades esperadas no payload.
- Painel, filtros, busca, fornecedores, fila de aprovação, CSV e entradas confirmadas, responsivos.
- Fornecedores cadastrados aparecem mesmo sem recebimentos, com busca por nomes anteriores, referências e CNPJ. Bases importadas preservam origem e linhas da planilha; cadastros ambíguos podem ser filtrados para revisão. O formulário de recebimento sugere fornecedores do grupo da empresa selecionada. Produtos preparados a partir de XMLs podem sugerir vínculos em Identificação; o usuário confirma as conversões antes de salvar a relação reutilizável.
- Contas a pagar em `/contas-a-pagar`: notas XML (mesmo pendentes de identificação), recebimentos manuais e despesas sem nota/CNPJ. Parcelas e vencimentos do XML, registro de baixa, cancelamento, filtros por empresa e histórico imutável. Despesas por nome criam ou reutilizam a ficha individual do fornecedor.
- Testes de domínio, integração SQL, navegador e CI.

## Limites desta etapa

Esta é uma primeira fatia funcional do produto, **não a implementação integral da especificação**. WhatsApp, IA, consulta à SEFAZ, evidências de qualidade/temperatura, magic links, Realtime/push, receitas/CMV, PDV e compras ainda não estão implementados. O detalhamento está em [docs/roadmap.md](docs/roadmap.md).

O painel considera até os 500 recebimentos mais recentes visíveis ao usuário. A tela de estoque considera entradas, correções de notas e movimentações de pedidos/entregas. Perdas e inventário ainda não têm fluxo implementado. Correções podem reduzir o saldo abaixo de zero se o material já tiver sido consumido ou transferido; novas entregas continuam sujeitas à verificação de saldo. Créditos são calculados e criados no fechamento; liquidação e documento de cobrança ainda não têm interface.

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

## Importação XML

Em `/operacao`, escolha **Importar XML**, envie a NF-e e revise as unidades. A empresa precisa estar cadastrada com o mesmo CNPJ destinatário. Caixas, fardos e outras embalagens exigem fator explícito; KG/L/UN e equivalentes conhecidos usam conversão determinística. O fornecedor é associado pelo CNPJ dentro do grupo. Reimportar a mesma chave é bloqueado; repetir a mesma solicitação é idempotente.

A conferência usa o valor líquido dos produtos (`vProd - vDesc`) e calcula a falta proporcionalmente, preservando o total exato mesmo com preço unitário fracionário. O total original da NF-e, incluindo seus demais componentes, fica separado. Frete e tributos não são rateados automaticamente. Custos unitários são `numeric(20,8)` em centavos; totais financeiros continuam inteiros.

Aceita XML UTF-8 até 1 MB, até 990 itens, NF-e de saída normal do fornecedor em produção e protocolo `100`/`150`. Recusa eventos, cancelamentos, homologação, notas de ajuste/complemento/devolução e itens que não integram o total. A leitura valida consistência do arquivo; não verifica assinatura digital nem consulta a situação atual na SEFAZ. Conversões de embalagem são revisadas em cada importação; não há catálogo persistente de embalagens nesta etapa.

## Produtos, categorias e CMV

O menu **Produtos** (`/produtos`) reúne produtos cadastrados manualmente ou introduzidos pelos recebimentos. Gestores do grupo podem criar/renomear categorias, cadastrar produtos e editar categoria e **Compõe CMV: Sim/Não**. Busca e filtros ajudam a revisar o catálogo. O cadastro é compartilhado entre as empresas do mesmo grupo; categorias não podem ser vinculadas entre grupos.

Produtos antigos e importados sem revisão ficam com CMV **Não definido** (`null`), sem pressupor Sim ou Não. Ao salvar pelo catálogo, a escolha é obrigatória. Na prévia XML, produtos novos aceitam categoria e CMV; os existentes preservam a classificação atual. Novos recebimentos nunca sobrescrevem essa classificação. Identificação e unidade de produtos existentes ficam preservadas; editar a classificação não altera quantidades, valores fiscais ou créditos. A marcação prepara o catálogo para a apuração de CMV; não implementa por si só o cálculo de consumo/CMV.

## Contas a pagar

A migration `20260924130506_accounts_payable.sql` cria contas, parcelas e histórico com RLS de gestor (incluindo gestor de unidade) e escrita exclusivamente por RPC. Triggers diferidos integram os documentos ao final da transação, sem lançar estoque ou executar pagamentos. A chave da nota por grupo e o recebimento único impedem duplicação ao sair de Identificação; despesas manuais usam uma chave de requisição para retentativas.

O financeiro usa o total da nota, incluindo frete e tributos. Créditos por divergência física continuam separados e não são abatidos automaticamente. Parcelas do XML só são aceitas quando somam o total; cobranças incompatíveis ficam para revisão. Sem vencimento no XML, a data permanece em branco. XML não autorizado ou sem empresa destinatária identificada permanece na fila e não gera conta.

Edições na nota atualizam a conta e sinalizam revisão quando alteram total, fornecedor ou empresa; parcelas e baixas existentes são preservadas. O usuário ajusta as parcelas para o novo total antes de salvar. Todas as edições financeiras têm versão e histórico. Importar uma nota nunca a marca como paga, inclusive notas históricas. A baixa registra o pagamento informado pelo usuário; não há integração bancária.

Testes: `supabase/tests/payables.sql` e `tests/e2e/payables.spec.ts` cobrem parcelas, XML pendente, deduplicação, recebimento manual, despesas sem CNPJ, baixas, histórico, edição e isolamento de acesso.

## Conferência de quantidades

Recebimentos mostra o resumo dos XMLs enviados, quantos já geraram recebimento e quantos permanecem em Identificação. O resumo respeita as empresas e permissões do usuário e separa XMLs sem empresa identificada ao filtrar por unidade.

Gestor e operador veem a quantidade da nota e o campo recebido lado a lado. “Veio certo” preenche um item; “Preencher tudo conforme a nota” preenche todos. O usuário ainda finaliza a conferência, podendo ajustar faltas/excessos antes de salvar. XMLs com conversão mostram a quantidade comercial original e a equivalente na unidade de estoque. A leitura do operador usa `stockai_get_receipt_conference`, sem expor preços ou créditos; o endpoint cego anterior permanece disponível para compatibilidade.
