-- Illustrative SQL property graph definition and cycle pattern.
-- Verify syntax, data types, capabilities and privileges against the
-- selected Oracle release. This file has not been run against Oracle.
CREATE PROPERTY GRAPH credit_network
  VERTEX TABLES (
    demo_accounts KEY (account_id)
      LABEL account PROPERTIES (account_id, display_name, internal_review_flag),
    demo_devices KEY (device_id)
      LABEL device PROPERTIES (device_id)
  )
  EDGE TABLES (
    demo_transfers KEY (event_id)
      SOURCE KEY (sender_id) REFERENCES demo_accounts (account_id)
      DESTINATION KEY (recipient_id) REFERENCES demo_accounts (account_id)
      LABEL transfer PROPERTIES (event_id, amount_inr, tx_time),
    demo_device_links KEY (link_id)
      SOURCE KEY (account_id) REFERENCES demo_accounts (account_id)
      DESTINATION KEY (device_id) REFERENCES demo_devices (device_id)
      LABEL uses_device PROPERTIES (link_id)
  );

-- Three directed transfers in increasing event time. Window bounds are
-- typed application binds. The gross sum does not represent unique funds.
SELECT *
FROM GRAPH_TABLE (
  credit_network
  MATCH (a IS account)-[e1 IS transfer]->(b IS account)
        -[e2 IS transfer]->(c IS account)-[e3 IS transfer]->(a)
  WHERE a.account_id <> b.account_id
    AND b.account_id <> c.account_id
    AND c.account_id <> a.account_id
    AND e1.tx_time < e2.tx_time
    AND e2.tx_time < e3.tx_time
    AND e1.tx_time >= :window_start
    AND e3.tx_time <= :window_end
  COLUMNS (
    a.account_id AS start_account,
    b.account_id AS second_account,
    c.account_id AS third_account,
    e1.event_id AS first_transfer,
    e2.event_id AS second_transfer,
    e3.event_id AS third_transfer,
    e1.amount_inr + e2.amount_inr + e3.amount_inr AS gross_transfer_inr
  )
);
