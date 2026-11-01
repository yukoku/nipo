-- テスト用DB。開発用DB（nipo_dev）は compose.yaml の POSTGRES_DB で作成される
-- このファイルは、ボリュームが空の状態で初めてコンテナを起動したときだけ実行される
CREATE DATABASE nipo_test OWNER nipo;
