# Pedidos das cozinhas e entregas

- `/pedidos`: crie uma requisição selecionando restaurante, cozinha/setor, estoque de origem, data desejada e produtos do catálogo do grupo.
- `/entregas`: os pedidos expedidos ficam aguardando conferência e assinatura. O histórico pode ser filtrado por empresa, situação, cozinha ou número.
- Origem e destino são empresas diferentes do mesmo grupo. Cadastre ambas em Empresas; não é criado um estoque fictício automaticamente.
- Operadores podem solicitar para suas unidades. Gestores da origem podem expedir. Na entrega, um usuário autorizado na origem ou destino abre o pedido; quem recebe informa o nome, desenha a assinatura e confirma as quantidades no dispositivo.
- Expedição permite quantidade menor que a solicitada. Zero significa não atendido. O comprovante mantém pedido e expedido; o restante exige uma nova requisição.
- A expedição baixa o saldo da origem. A assinatura registra a entrada no restaurante. Durante esse intervalo, os produtos estão em trânsito. Pedidos só podem ser cancelados antes da expedição.
- Se o físico recebido divergir do expedido, não assine: resolva a divergência com o estoque. Esta versão não inclui devolução ou estorno de entregas expedidas.
- Assinatura, nome, quantidades, horários do servidor e usuários responsáveis ficam vinculados ao pedido. O comprovante pode ser consultado e impresso. A assinatura é um registro manuscrito de recebimento, sem certificado digital.

## Consistência e permissões

As tabelas `stockai_orders`, `stockai_order_lines` e `stockai_order_movements` têm RLS e somente leitura direta para usuários autenticados. Alterações passam por RPCs com validação de grupo, unidade e papel. Os movimentos são imutáveis. Operações repetidas são idempotentes; locks no pedido e no saldo por produto evitam baixa duplicada e expedição concorrente acima do saldo.

`stockai_stock_balances` agrega o livro de entradas e o de transferências, respeitando as permissões existentes. O custo das transferências usa a média do saldo da origem, arredondada em centavos; saídas e entradas usam o mesmo custo. Documentos fiscais e CMV dos produtos não são alterados.

## Validação

`supabase/tests/orders.sql`: isolamento, funções sem login, operador, saldo insuficiente, quantidade acima do pedido, assinatura vazia, repetição de confirmação, cancelamento e conservação dos valores.

`tests/e2e/orders.spec.ts`: pedido, expedição parcial, assinatura em celular, consulta após recarregar, saldo de origem/destino e acesso à tela de estoque. Apenas banco local.
