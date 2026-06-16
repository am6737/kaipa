#!/bin/bash
# Download Unsplash scenery photos for each route/journey, upload to Supabase Storage,
# and update photo_uris in the database.

set -e

BASE="https://8000--main--am--am6737.coder.dootask.com"
ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzgwOTc3MjY2LCJleHAiOjIwOTYzMzcyNjZ9.vil4-e9_QqHR-yZ-l_jBiDc57CjgnSqu-dwnCZ0k_lU"
SERVICE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3ODA5NzcyNjYsImV4cCI6MjA5NjMzNzI2Nn0.TrKAsukscLhMbJiMHD8WWWFid9-4QyZTE0hGopbqCLI"
BUCKET="kaipa"
TMP="/tmp/kaipa-img"
mkdir -p "$TMP"

# Tone → Unsplash photo ID pools (same as tones.ts PHOTO_POOLS)
declare -A POOLS
POOLS[ridge]="1500534314209-a25ddb2bd429 1454496522488-7a8e488e8606 1470770841072-f978cf4d019e 1464822759023-fed622ff2c3b"
POOLS[forest]="1441974231531-c6227db76b6e 1426604966848-d7adac402bff 1418065460487-3e41a6c84dc5 1464822759023-fed622ff2c3b"
POOLS[sand]="1509316785289-025f5b846b35 1473580044384-7ba9967e16a0 1547234935-80c7145ec969 1444492417251-9c84a5fa18e0"
POOLS[dusk]="1549880181-56a44cf4a9a5 1469474968028-56623f02e42e 1495616811223-4d98c6e9c869 1470071459604-3b5ec3a7fe05"
POOLS[river]="1472213984618-c79aaec7fef0 1439066615861-d1af74d74000 1470770841072-f978cf4d019e 1432889490240-84df33d47091"
POOLS[night]="1419242902214-272b3f66ee7a 1444703686981-a3abbc4d4fe3"
POOLS[moss]="1448375240586-882707db888b 1418065460487-3e41a6c84dc5 1470071459604-3b5ec3a7fe05 1426604966848-d7adac402bff"
POOLS[rock]="1477468572316-36979010099d 1560710990-9f5d4197b5a2 1547234935-80c7145ec969 1500534314209-a25ddb2bd429"
POOLS[snow]="1454496522488-7a8e488e8606 1483921020237-2ff51e8e4b22 1465220183275-1faa863377e3 1531436040007-7216019112d7 1611572757951-6b8e7f068942 1527236278376-a1ed0f95da30 1507281736509-c6289f1ea0f8"

# Simple hash function matching tones.ts hashStr
hashstr() {
  local s="$1" h=0 i
  for (( i=0; i<${#s}; i++ )); do
    c=$(printf '%d' "'${s:$i:1}")
    h=$(( ((h << 5) - h + c) & 0x7FFFFFFF ))
  done
  echo $h
}

pick_photo_id() {
  local tone="$1" seed="$2"
  local pool_str="${POOLS[$tone]}"
  local -a pool=($pool_str)
  local n=${#pool[@]}
  local h=$(hashstr "${seed}${tone}ridge")  # match tones.ts: hashStr(seed || tone || 'ridge')
  # Actually tones.ts does hashStr(seed || tone || 'ridge') which is hashStr(seed) since seed is always set
  h=$(hashstr "$seed")
  local idx=$(( h % n ))
  echo "${pool[$idx]}"
}

upload_and_get_url() {
  local poi_id="$1" tone="$2" table="$3"
  local photo_id=$(pick_photo_id "$tone" "$poi_id")
  local unsplash_url="https://images.unsplash.com/photo-${photo_id}?fm=jpg&q=80&w=1200&auto=format&fit=crop"
  local filename="covers/${poi_id}.jpg"
  local local_path="${TMP}/${poi_id}.jpg"

  echo "  [$poi_id] tone=$tone photo=$photo_id"

  # Download from Unsplash
  curl -sL "$unsplash_url" -o "$local_path"
  if [ ! -s "$local_path" ]; then
    echo "    WARN: download failed, skipping"
    return
  fi

  # Upload to Supabase Storage
  local upload_resp=$(curl -s -X POST \
    "${BASE}/storage/v1/object/${BUCKET}/${filename}" \
    -H "apikey: ${ANON_KEY}" \
    -H "Authorization: Bearer ${SERVICE_KEY}" \
    -H "Content-Type: image/jpeg" \
    -H "x-upsert: true" \
    --data-binary "@${local_path}")

  # Public URL
  local public_url="${BASE}/storage/v1/object/public/${BUCKET}/${filename}"

  # Update DB
  docker exec supabase-db psql -U postgres -d postgres -q -c \
    "UPDATE ${table} SET photo_uris = jsonb_build_array('${public_url}') WHERE id = '${poi_id}';"

  echo "    -> ${public_url}"
}

echo "=== Uploading route covers ==="
for row in $(docker exec supabase-db psql -U postgres -d postgres -t -A -c "SELECT id || '|' || tone FROM routes;"); do
  IFS='|' read -r id tone <<< "$row"
  upload_and_get_url "$id" "$tone" "routes"
done

echo ""
echo "=== Uploading journey covers ==="
for row in $(docker exec supabase-db psql -U postgres -d postgres -t -A -c "SELECT id || '|' || tone FROM journeys;"); do
  IFS='|' read -r id tone <<< "$row"
  upload_and_get_url "$id" "$tone" "journeys"
done

echo ""
echo "=== Done ==="
rm -rf "$TMP"
