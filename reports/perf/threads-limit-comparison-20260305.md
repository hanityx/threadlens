# Threads Limit Comparison (2026-03-05T06:45:09)

- Endpoint: `GET /api/threads?offset=0&q=&sort=updated_desc`
- TS API: `http://127.0.0.1:8788`

## limit=60
- curl: `time_total=0.001231 size_download=48381`
- response bytes (file): `48381`
- rows returned: `60`

## limit=160
- curl: `time_total=0.001627 size_download=131309`
- response bytes (file): `131309`
- rows returned: `160`

## delta
- byte ratio (160/60): `2.71x`
- byte reduction when using 60: `63.2%`
