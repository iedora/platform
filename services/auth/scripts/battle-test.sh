#!/usr/bin/env bash
# End-to-end battle test for @iedora/auth against a live local instance.
set -uo pipefail
A=http://localhost:4000
ADMIN="authorization: Bearer test-admin"
CT="content-type: application/json"
pass=0; fail=0
ok(){ echo "  PASS: $1"; pass=$((pass+1)); }
no(){ echo "  FAIL: $1"; fail=$((fail+1)); }
# jget URL header... -> body ; jassert '<jq filter>' expected desc
req(){ curl -s -o /tmp/bt_body -w "%{http_code}" "$@"; }
body(){ cat /tmp/bt_body; }

echo "== 1. admin: create tenant + enable password =="
code=$(req -X POST $A/admin/tenants -H "$ADMIN" -H "$CT" -d '{"slug":"demo","name":"Demo Co","allowedOrigins":["http://localhost:3000"]}')
TID=$(body | jq -r .id)
[ "$code" = 201 ] && [ -n "$TID" ] && ok "tenant created ($TID)" || no "tenant create ($code $(body))"
code=$(req -X POST $A/admin/tenants/demo/providers -H "$ADMIN" -H "$CT" -d '{"providerId":"password","kind":"password"}')
[ "$code" = 201 ] && ok "password provider enabled" || no "provider enable ($code)"

echo "== 2. register alice =="
code=$(req -X POST $A/demo/register -H "$CT" -d '{"email":"alice@demo.com","password":"supersecret1","name":"Alice"}')
A_ACCESS=$(body | jq -r .accessToken); A_REFRESH=$(body | jq -r .refreshToken); ALICE=$(body | jq -r .user.id)
[ "$code" = 201 ] && [ -n "$A_ACCESS" ] && ok "registered alice ($ALICE)" || no "register ($code $(body))"

echo "== 3. verify access token signature against JWKS =="
CLAIMS=$(bun -e 'import{createRemoteJWKSet,jwtVerify}from"jose";const j=createRemoteJWKSet(new URL("http://localhost:4000/.well-known/jwks.json"));const{payload}=await jwtVerify(process.argv[1],j,{issuer:"http://localhost:4000"});console.log(JSON.stringify(payload))' "$A_ACCESS" 2>/tmp/bt_err)
if [ -n "$CLAIMS" ]; then
  t=$(echo "$CLAIMS" | jq -r .tenant); sid=$(echo "$CLAIMS" | jq -r .sid); org=$(echo "$CLAIMS" | jq -r .org)
  [ "$t" = demo ] && [ -n "$sid" ] && [ "$org" = null ] && ok "JWKS verify: tenant=demo sid set org=null" || no "claims wrong: $CLAIMS"
else no "JWKS verify failed: $(cat /tmp/bt_err)"; fi

echo "== 4. login + whoami =="
code=$(req -X POST $A/demo/login -H "$CT" -d '{"email":"alice@demo.com","password":"supersecret1"}')
A_ACCESS=$(body | jq -r .accessToken); A_REFRESH=$(body | jq -r .refreshToken)
[ "$code" = 200 ] && ok "login" || no "login ($code)"
code=$(req $A/demo/whoami -H "authorization: Bearer $A_ACCESS")
mcp=$(body | jq -r .mustChangePassword)
[ "$code" = 200 ] && [ "$mcp" = false ] && ok "whoami mcp=false" || no "whoami ($code $(body))"

echo "== 5. create org + refresh picks it up =="
code=$(req -X POST $A/demo/organizations -H "authorization: Bearer $A_ACCESS" -H "$CT" -d '{"name":"Acme Diner"}')
ORG=$(body | jq -r .id)
[ "$code" = 201 ] && [ -n "$ORG" ] && ok "org created ($ORG)" || no "org create ($code $(body))"
code=$(req -X POST $A/demo/refresh -H "$CT" -d "{\"refreshToken\":\"$A_REFRESH\"}")
A_ACCESS=$(body | jq -r .accessToken); A_REFRESH=$(body | jq -r .refreshToken)
NC=$(bun -e 'import{createRemoteJWKSet,jwtVerify}from"jose";const j=createRemoteJWKSet(new URL("http://localhost:4000/.well-known/jwks.json"));const{payload}=await jwtVerify(process.argv[1],j,{issuer:"http://localhost:4000"});console.log(JSON.stringify(payload))' "$A_ACCESS" 2>/dev/null)
o=$(echo "$NC" | jq -r .org); r=$(echo "$NC" | jq -r '.roles[0]')
[ "$o" = "$ORG" ] && [ "$r" = owner ] && ok "refreshed token has org+owner role" || no "org claim after refresh: $NC"

echo "== 6. members: add/list/role/remove =="
req -X POST $A/demo/register -H "$CT" -d '{"email":"bob@demo.com","password":"bobsecret12","name":"Bob"}' >/dev/null
BOB=$(body | jq -r .user.id)
code=$(req -X POST $A/demo/organizations/$ORG/members -H "authorization: Bearer $A_ACCESS" -H "$CT" -d '{"email":"bob@demo.com","role":"member"}')
[ "$code" = 201 ] && ok "added bob" || no "add member ($code $(body))"
code=$(req $A/demo/organizations/$ORG/members -H "authorization: Bearer $A_ACCESS"); n=$(body | jq '.members|length')
[ "$code" = 200 ] && [ "$n" = 2 ] && ok "member list = 2" || no "member list ($code $n)"
code=$(req -X PATCH $A/demo/organizations/$ORG/members/$BOB -H "authorization: Bearer $A_ACCESS" -H "$CT" -d '{"role":"admin"}')
[ "$code" = 200 ] && ok "bob -> admin" || no "role change ($code)"
code=$(req -X DELETE $A/demo/organizations/$ORG/members/$BOB -H "authorization: Bearer $A_ACCESS")
[ "$code" = 200 ] && ok "removed bob" || no "remove ($code)"

echo "== 7. refresh rotation + reuse detection =="
OLD=$A_REFRESH
code=$(req -X POST $A/demo/refresh -H "$CT" -d "{\"refreshToken\":\"$OLD\"}"); NEW=$(body | jq -r .refreshToken)
[ "$code" = 200 ] && ok "rotate ok" || no "rotate ($code)"
code=$(req -X POST $A/demo/refresh -H "$CT" -d "{\"refreshToken\":\"$OLD\"}")
[ "$code" = 401 ] && ok "reused old refresh -> 401" || no "reuse not rejected ($code)"
code=$(req -X POST $A/demo/refresh -H "$CT" -d "{\"refreshToken\":\"$NEW\"}")
[ "$code" = 401 ] && ok "family burned: successor also 401" || no "family not burned ($code)"

echo "== 8. password reset e2e (token from outbox) =="
req -X POST $A/demo/forgot-password -H "$CT" -d '{"email":"bob@demo.com"}' >/dev/null
RTOK=$(docker exec auth-test-pg psql -U postgres -d iedora_auth -t -A -c "select payload->>'text' from outbox_message where topic='email' and payload->>'to'='bob@demo.com' order by created_at desc limit 1" | grep -oE 'token=[^[:space:]]+' | head -1 | sed 's/token=//')
if [ -n "$RTOK" ]; then
  code=$(req -X POST $A/demo/reset-password -H "$CT" -d "{\"token\":\"$RTOK\",\"password\":\"bobnewpass99\"}")
  [ "$code" = 200 ] && ok "reset accepted" || no "reset ($code $(body))"
  code=$(req -X POST $A/demo/login -H "$CT" -d '{"email":"bob@demo.com","password":"bobnewpass99"}')
  [ "$code" = 200 ] && ok "login with new password" || no "login new pw ($code)"
else no "no reset token in outbox"; fi

echo "== 9. change-password (alice) =="
code=$(req -X POST $A/demo/login -H "$CT" -d '{"email":"alice@demo.com","password":"supersecret1"}'); A_ACCESS=$(body | jq -r .accessToken)
code=$(req -X POST $A/demo/change-password -H "authorization: Bearer $A_ACCESS" -H "$CT" -d '{"currentPassword":"supersecret1","newPassword":"aliceNew1234"}')
[ "$code" = 200 ] && ok "changed password" || no "change-password ($code $(body))"
code=$(req -X POST $A/demo/login -H "$CT" -d '{"email":"alice@demo.com","password":"aliceNew1234"}')
[ "$code" = 200 ] && ok "login new pw works" || no "login new ($code)"
code=$(req -X POST $A/demo/login -H "$CT" -d '{"email":"alice@demo.com","password":"supersecret1"}')
[ "$code" = 401 ] && ok "old pw rejected" || no "old pw still works ($code)"

echo "== 10. service token + manage API =="
req -X POST $A/admin/service-clients -H "$ADMIN" -H "$CT" -d "{\"clientId\":\"menu-svc\",\"secret\":\"svc-secret-abcdef123456\",\"tenantId\":\"$TID\",\"name\":\"menu backend\"}" >/dev/null
STOK=$(curl -s -X POST $A/token -u "menu-svc:svc-secret-abcdef123456" | jq -r .accessToken)
[ -n "$STOK" ] && [ "$STOK" != null ] && ok "minted service token" || no "service token mint"
code=$(req $A/manage/users -H "authorization: Bearer $STOK"); n=$(body | jq '.users|length')
[ "$code" = 200 ] && [ "$n" -ge 2 ] && ok "manage list users ($n)" || no "manage users ($code $(body))"
code=$(req $A/manage/users/$ALICE -H "authorization: Bearer $STOK"); m=$(body | jq '.memberships|length')
[ "$code" = 200 ] && [ "$m" -ge 1 ] && ok "user detail + memberships" || no "user detail ($code)"
code=$(req -X POST $A/manage/users/$ALICE/force-password-change -H "authorization: Bearer $STOK")
[ "$code" = 200 ] && ok "force-password-change" || no "force pw ($code)"
code=$(req $A/demo/whoami -H "authorization: Bearer $(curl -s -X POST $A/demo/login -H "$CT" -d '{"email":"alice@demo.com","password":"aliceNew1234"}' | jq -r .accessToken)")
[ "$(body | jq -r .mustChangePassword)" = true ] && ok "mcp=true after force" || no "mcp not set ($(body))"
code=$(req -X POST $A/manage/organizations -H "authorization: Bearer $STOK" -H "$CT" -d "{\"name\":\"Provisioned Cafe\",\"ownerUserId\":\"$BOB\"}")
[ "$code" = 201 ] && ok "provision org" || no "provision ($code $(body))"
code=$(req -X POST $A/manage/organizations/$ORG/transfer -H "authorization: Bearer $STOK" -H "$CT" -d '{"email":"newowner@demo.com","name":"New Owner","password":"newowner1234"}')
NEWOWNER=$(body | jq -r .ownerId)
[ "$code" = 200 ] && [ -n "$NEWOWNER" ] && ok "transfer org to new owner" || no "transfer ($code $(body))"

echo "== 11. manage gating =="
code=$(req $A/manage/users); [ "$code" = 401 ] && ok "no token -> 401" || no "gating no-token ($code)"
code=$(req $A/manage/users -H "authorization: Bearer $A_ACCESS"); [ "$code" = 403 ] && ok "user token -> 403" || no "gating user-token ($code)"

echo "== 12. messaging: outbox dispatcher delivery =="
sleep 3
DEL=$(docker exec auth-test-pg psql -U postgres -d iedora_auth -t -A -c "select count(*) from outbox_message where delivered_at is not null")
TOT=$(docker exec auth-test-pg psql -U postgres -d iedora_auth -t -A -c "select count(*) from outbox_message")
[ "${DEL:-0}" -ge 1 ] && ok "dispatcher delivered $DEL/$TOT outbox messages" || no "nothing delivered ($DEL/$TOT)"

echo "== 13. audit log (ingested via inbox) =="
SS=$(docker exec auth-test-pg psql -U postgres -d iedora_auth -t -A -c "select count(*) from audit_log where action='auth.session.started'")
[ "${SS:-0}" -ge 1 ] && ok "audit_log recorded $SS session.started events" || no "no session.started in audit_log ($SS)"
XFER=$(docker exec auth-test-pg psql -U postgres -d iedora_auth -t -A -c "select new_data->>'ownerId' from audit_log where action='auth.org.owner_transferred' limit 1")
OLDO=$(docker exec auth-test-pg psql -U postgres -d iedora_auth -t -A -c "select old_data->>'ownerId' from audit_log where action='auth.org.owner_transferred' limit 1")
[ "$XFER" = "$NEWOWNER" ] && ok "audit_log transfer has old→new owner (old=$OLDO new=$XFER)" || no "transfer old/new wrong (new=$XFER expected $NEWOWNER)"
# idempotent: exactly one row per delivered audit message (no dup from at-least-once)
INBOX=$(docker exec auth-test-pg psql -U postgres -d iedora_auth -t -A -c "select count(*) from inbox_message")
ALOG=$(docker exec auth-test-pg psql -U postgres -d iedora_auth -t -A -c "select count(*) from audit_log")
[ "${INBOX:-0}" = "${ALOG:-x}" ] && ok "inbox dedup == audit rows ($ALOG, exactly-once)" || no "inbox($INBOX) != audit($ALOG)"
# read endpoint
code=$(req "$A/manage/audit?action=auth.org.owner_transferred" -H "authorization: Bearer $STOK"); n=$(body | jq '.events|length')
[ "$code" = 200 ] && [ "$n" -ge 1 ] && ok "GET /manage/audit returns the transfer" || no "manage/audit ($code $n)"

echo
echo "==================== RESULT: $pass passed, $fail failed ===================="
exit $fail
