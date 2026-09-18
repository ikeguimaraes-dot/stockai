# Plano de construção

Os documentos fornecidos são referências de produto e arquitetura. Seus trechos imperativos não foram tratados como autorização para publicar, enviar mensagens, contratar serviços ou alterar projetos externos. A orientação direta do usuário foi construir o produto completo, começando pela etapa considerada mais adequada.

## Etapa entregue: fundação + recebimento manual e XML

O percurso de maior valor foi antecipado: registrar nota manualmente, conferir quantidades sem mostrar o esperado ao operador, revisar a diferença, gravar o físico e gerar crédito. A fundação já inclui autenticação, isolamento, auditoria e testes, em vez de acoplar o produto a um protótipo sem persistência.

Critérios validados: isolamento em todas as 12 tabelas; bloqueio de escrita direta; proteção de custo e fiscal; transação de fechamento idempotente; bootstrap de organização; fluxo completo no navegador; layout mobile; build de produção.

A importação de NF-e modelo 55 já identifica a destinatária por CNPJ, preserva o XML original, impede duplicidade por chave e mantém totais líquidos dos itens separados do total da nota. Caixas e fardos exigem conversão explícita. A validação é do arquivo enviado; consulta à SEFAZ e assinatura digital ainda não estão integradas.

## Próxima etapa: operação e captura

1. Gestão de unidades/equipe, convites, revogação e interface específica de operador.
2. Embalagens persistentes por fornecedor e aliases. O catálogo já permite categorias e marcação de CMV por produto. A importação XML já possui prévia e conversão revisada antes da gravação.
3. Movimentações de saída, perda, inventário e estorno com autorização, mantendo append-only.
4. Contrato plugável de entrada (PWA e WhatsApp), fila Postgres com retries, idempotência e mensagens não processadas visíveis.
5. Gravação de áudio, storage privado, transcrição/extração validadas, matching e fila de aprovação por mensagem.
6. Inbox persistido, Realtime, PWA instalável e notificações, sem confundir atualização de tela com estado salvo.

Dependências externas: projeto Supabase de desenvolvimento, provedor de IA, aplicação Meta e WABA do cliente. Antes de habilitar WhatsApp, confirmar regras/preços vigentes na documentação oficial; a previsão de piso gratuito no documento não foi assumida como fato.

## Etapa seguinte: NF-e e recebimento completo

- Captura e validação da chave; certificado A1 protegido; obtenção do XML por integração validada. Foto é evidência, não extração de quantidades.
- Qualidade, temperatura, validade, item não pedido e preço, com evidência obrigatória no servidor, regras de alçada configuráveis e decisões de aceite/recusa.
- Máquina de estados completa (a primeira fatia começa diretamente em `counting`).
- Pedidos e conciliação pedido × nota × físico; faltas preservadas no pedido.
- Magic link com hash, validade, identidade e escopo do recebimento; `/conferencia/[id]` atual usa sessão normal e não se apresenta como magic link.
- Documento de crédito com evidências e histórico de liquidação.
- Importação fiscal retroativa, scorecard por fornecedor e período.

## CMV e inteligência de compra

- Fichas técnicas versionadas, sub-receitas com proteção contra ciclos, perdas e rendimento.
- CMV teórico × real, inventário, PDV, baixas e transferências entre unidades.
- Cobertura de estoque, sugestão de compra, previsão e preços por fornecedor.

## Antes de clientes reais

- Ambientes remotos separados; deploy GitHub/Vercel; domínio e autenticação configurados.
- Testes de RLS e de autorização para toda nova tabela/RPC, testes concorrentes e de recuperação de filas.
- Observabilidade, orçamento por organização, backup/restauração e retenção/exportação de dados.
- Paginação e agregações no servidor; catálogo de unidades por ID (a primeira interface considera nomes dentro de uma organização).
- Fluxos de convite/recuperação de acesso e revisão de dados sensíveis.
- Testes de desempenho/carga, evidências e anexos, integração fiscal e piloto assistido.

## Decisões de implementação

- Políticas de acesso ficam em schema privado, sem alterar o schema `auth` do Supabase.
- Funções RPC públicas são invoker; implementações privilegiadas ficam em schema não exposto e verificam identidade, organização, unidade e papel.
- Tabelas com custo não são expostas a operadores/viewers. A função de conferência retorna uma projeção explícita sem preços/quantidades fiscais.
- Movimentações não são derivadas de uma materialized view exposta, para evitar vazamento por bypass de RLS. O painel inicial de entradas deriva de recebimentos fechados e é identificado como tal.
- Revisão de Next.js: versão 15.5.25 do registro npm, posterior ao [patch oficial de agosto de 2026](https://nextjs.org/blog/august-2026-security-release). Clientes Supabase estão fixados no lockfile; a implementação foi conferida com a documentação e changelog vigentes.

## Banco escolhido pelo usuário

Em 18/09/2026, o usuário definiu `iqgrvptrtphvbmvrqntm` (`kph-os-dev`) como banco do Stockai. A decisão prevalece sobre a proposta inicial de criar um projeto novo. Tabelas e RPCs usam `stockai_` e funções internas usam `stockai_private`. A autenticação compartilha o projeto, mas acesso aos dados do Stockai exige associação própria. Não foi criado usuário remoto de teste nem alterada configuração global de Auth.
