# CLI connections and ingestion

`status` reports permission-filtered connection/dataset health and datasets needing attention. It does not reproduce dashboard totals or validate credentials with providers.

`connection sync <id> --dataset <name>` queues existing ingestion workers. `all` selects the connection's supported worker groups. Shopify products/inventory are one group; Shopify orders/financial transactions are another. Amazon inventory refreshes FBA US and AWD together; orders/financial transactions/stock history share its sales worker. eBay currently supports orders; Amazon Ads supports ad spend. Grouped requests require access to every collected dataset, or workspace administration.

`connection sync show <id> --run-id <run>` polls the exact jobs accepted for a run. Without a run ID it selects the latest CLI-requested run. `--wait` follows the returned read selector. Existing active jobs are joined; repeated execution keys return the original receipt rather than queueing another run. A deliberately new execution can refresh completed work. A replaced/disconnected account rejects polling rather than returning another account's data.

Run completion describes the retained jobs, not a guarantee of complete dataset coverage. Dataset coverage is the current stored projection and can include later ingestion. Worker failures are sanitized. Missing job evidence produces `needs_attention`, never false success. The shared worker may record incomplete optional financial/history coverage without failing its whole job; inspect datasets as well as operation state. Completed times remain null because the existing job ledger does not record them.

The sync receipt, queued work and CLI idempotency receipt commit together. Nested producers defer queue wake signals until that outer commit; failed publication retains the existing scheduled recovery behavior. No provider business-data write occurs.

Connection connect/reconnect/disconnect and provider writes are separate work. Current registration/settings and inventory-selection commands remain available. No generic job or retry command is introduced.
