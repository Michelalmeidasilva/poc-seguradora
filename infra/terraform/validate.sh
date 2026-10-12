#!/usr/bin/env bash
# Offline validation of the Terraform stack. Never talks to GCP: no plan, no apply, no
# credentials. Only `fmt`, `init -backend=false` (downloads providers from the public
# registry) and `validate`, plus structural checks on the .tf files.
# Compatible with macOS bash 3.2 (no mapfile, no associative arrays, no empty-array expansion).
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

failures=0
fail() {
  echo "FAIL: $*"
  failures=$((failures + 1))
}
pass() {
  echo "ok   $*"
}

# Fail fast when there is no configuration at all.
if ! ls ./*.tf >/dev/null 2>&1; then
  echo "FAIL: no .tf files in $DIR"
  exit 1
fi

# Neutralize ambient credentials so nothing here can reach a real project by accident.
unset GOOGLE_APPLICATION_CREDENTIALS GOOGLE_CREDENTIALS GOOGLE_OAUTH_ACCESS_TOKEN CLOUDSDK_AUTH_ACCESS_TOKEN || true

echo "== terraform fmt -check -recursive"
if terraform fmt -check -recursive; then pass "fmt"; else fail "terraform fmt (run: terraform fmt -recursive)"; fi

echo "== terraform init -backend=false"
if terraform init -backend=false -input=false >/dev/null; then pass "init"; else fail "terraform init"; fi

echo "== terraform validate"
if terraform validate -no-color; then pass "validate"; else fail "terraform validate"; fi

echo "== outputs expose no secret"
if [ ! -f outputs.tf ]; then
  fail "outputs.tf missing"
elif grep -nE 'random_password|secret|sensitive[[:space:]]*=[[:space:]]*true' outputs.tf; then
  fail "outputs.tf references a secret (lines above)"
else
  pass "outputs.tf has no secret reference"
fi

echo "== secret value never in a .tf file"
# The only allowed source of the session secret value is random_password.
if grep -nE '(secret_data|SESSION_SECRET)[^=]*=[[:space:]]*"' ./*.tf; then
  fail "a literal secret value is assigned in a .tf file (lines above)"
else
  pass "no literal secret value"
fi
if grep -q 'secret_data[[:space:]]*=[[:space:]]*random_password\.' secrets.tf 2>/dev/null; then
  pass "secret version is fed by random_password"
else
  fail "secrets.tf must set secret_data from random_password"
fi

echo "== .gitignore covers tfvars, state and .terraform/"
for path in terraform.tfvars prod.tfvars terraform.tfstate terraform.tfstate.backup .terraform/x crash.log; do
  if git check-ignore -q "$DIR/$path"; then pass "ignored: $path"; else fail "not git-ignored: $path"; fi
done
if git check-ignore -q "$DIR/terraform.tfvars.example"; then fail "terraform.tfvars.example must NOT be ignored"; else pass "tracked: terraform.tfvars.example"; fi
if git check-ignore -q "$DIR/.terraform.lock.hcl"; then fail ".terraform.lock.hcl must NOT be ignored"; else pass "tracked: .terraform.lock.hcl"; fi

echo "== every variable has a description and a type"
# Split variables.tf into blocks: a block starts at `variable "x" {` and ends at a line `}`.
if [ ! -f variables.tf ]; then
  fail "variables.tf missing"
else
  missing="$(awk '
    /^variable "/ { name = $2; desc = 0; typ = 0; inblock = 1; next }
    inblock && /^[[:space:]]+description[[:space:]]*=/ { desc = 1 }
    inblock && /^[[:space:]]+type[[:space:]]*=/ { typ = 1 }
    inblock && /^}/ {
      if (!desc) print name " (no description)"
      if (!typ) print name " (no type)"
      inblock = 0
    }
  ' variables.tf)"
  if [ -n "$missing" ]; then fail "variables without description/type: $missing"; else pass "all variables have description and type"; fi
  nvars="$(grep -c '^variable "' variables.tf || true)"
  echo "     variables: $nvars"
fi

echo "== structural assertions"
# Prints the count of a resource type across all .tf files and checks the expected value.
count_type() {
  cat ./*.tf | grep -cE "^(resource|data) \"$1\"" || true
}
expect() {
  local type="$1" want="$2" got
  got="$(count_type "$type")"
  if [ "$got" = "$want" ]; then pass "$type blocks: $got"; else fail "$type blocks: got $got, want $want"; fi
}
expect google_cloud_run_v2_service 6
expect google_cloud_run_v2_service_iam_member 6
expect google_service_account 6
expect google_project_iam_member 0
expect google_service_account_iam_member 0
expect google_monitoring_notification_channel 1
expect google_project_service 1
expect google_secret_manager_secret 1
expect google_secret_manager_secret_version 1
expect google_secret_manager_secret_iam_member 1
expect random_password 1
expect google_compute_network 1
expect google_compute_subnetwork 1
expect google_artifact_registry_repository 1
expect google_billing_budget 1
expect google_iam_workload_identity_pool 0
expect google_iam_workload_identity_pool_provider 0
# The state bucket's IAM is bootstrap-only: a deployer with objectAdmin cannot read bucket IAM,
# so managing it here would break CI refresh with 403.
if grep -nE '^(resource|data) "google_storage_bucket_iam_' ./*.tf; then
  fail "google_storage_bucket_iam_* must not be managed by this stack (lines above)"
else
  pass "no google_storage_bucket_iam_* resource"
fi

# Each explicit service owns infrastructure; deploy.sh owns the image and client metadata.
run_block() {
  awk -v name="$1" '$0 ~ "^resource \"google_cloud_run_v2_service\" \"" name "\"" { on = 1 } on { print } on && /^}/ { exit }' run.tf
}
assert_in() {
  local svc="$1" pattern="$2" label="$3"
  if run_block "$svc" | grep -qE "$pattern"; then pass "$svc: $label"; else fail "$svc: missing $label"; fi
}
for svc in web gateway chatbot svc_cotacao svc_apolice svc_sinistro; do
  assert_in "$svc" 'image[[:space:]]*=[[:space:]]*local.placeholder_image' 'placeholder image'
  assert_in "$svc" 'ignore_changes.*template\[0\].containers\[0\].image.*client.*client_version' 'image/client ownership ignored'
  assert_in "$svc" "var\\.service_scaling\\.${svc}\\.min_instances" 'minimum scaling lookup'
  assert_in "$svc" "var\\.service_scaling\\.${svc}\\.max_instances" 'maximum scaling lookup'
  assert_in "$svc" "var\\.service_scaling\\.${svc}\\.memory" 'memory lookup'
  assert_in "$svc" 'tcp_socket' 'TCP startup probe'
  if grep -A8 "resource \"google_cloud_run_v2_service_iam_member\" \"${svc}_invoker\"" run.tf | grep -q 'member.*"allUsers"'; then pass "$svc: allUsers invoker"; else fail "$svc: missing allUsers invoker"; fi
done
for svc in chatbot svc_cotacao svc_apolice svc_sinistro; do
  assert_in "$svc" 'INGRESS_TRAFFIC_INTERNAL_ONLY' 'internal ingress'
  assert_in "$svc" 'session_affinity.*true' 'session affinity'
done
for svc in web gateway; do
  assert_in "$svc" 'INGRESS_TRAFFIC_ALL' 'public ingress'
  assert_in "$svc" 'timeout.*"3600s"' 'SSE timeout'
done
for svc in gateway chatbot; do assert_in "$svc" 'egress.*"ALL_TRAFFIC"' 'Direct VPC egress'; done
assert_in gateway 'cpu_idle.*false' 'always allocated CPU'
assert_in gateway 'secret_key_ref' 'Secret Manager reference'
assert_in gateway 'var\.trust_proxy_hops' 'proxy hops lookup'
assert_in gateway 'local.run_url.chatbot' 'chatbot URL wiring'
assert_in web 'local.run_url.gateway' 'gateway URL wiring'
for svc in svc_cotacao svc_apolice svc_sinistro; do
  if run_block "$svc" | grep -q 'vpc_access'; then fail "$svc: unexpected VPC egress"; else pass "$svc: no VPC egress"; fi
done
assert_in gateway 'local.web_public_url' 'allowed origin wiring'
if grep -q 'placeholder_image.*"us-docker.pkg.dev/cloudrun/container/hello"' main.tf; then pass 'official placeholder'; else fail 'missing official placeholder'; fi
for api in iamcredentials.googleapis.com sts.googleapis.com; do
  if grep -q "$api" main.tf; then fail "unused API: $api"; else pass "no unused API $api"; fi
done
for svc in svc_cotacao svc_apolice svc_sinistro; do assert_in chatbot "local.run_url.$svc" "$svc URL wiring"; done
if grep -nE '^(resource|variable|output) "(google_iam_workload_identity_pool[^" ]*|google_project_iam_member|google_service_account_iam_member|github_[^" ]*|image_tag|deploy_fake_services|service_urls|deployer_service_account|wif_provider)"|^resource "[^"]+" "(deployer|fake_services)"' ./*.tf; then fail 'removed CI identities/legacy configuration present'; else pass 'no CI identities or legacy configuration'; fi
if grep -qE 'private_ip_google_access[[:space:]]*=[[:space:]]*true' network.tf 2>/dev/null; then pass "subnet private_ip_google_access"; else fail "subnet without private_ip_google_access = true"; fi
if grep -qE '"10\.10\.0\.0/24"' network.tf 2>/dev/null; then pass "subnet 10.10.0.0/24"; else fail "subnet range is not 10.10.0.0/24"; fi
if grep -qE 'backend "gcs" \{\}' versions.tf 2>/dev/null; then pass "partial gcs backend"; else fail 'versions.tf needs backend "gcs" {}'; fi

echo "Expected resource instances: default 31 = 6 APIs + registry 1 + network/subnet 2 + runtime SAs 6 + secret/password/accessor 4 + services/invokers 12; budget only 33; budget and email 35."

echo "== resource counts by type (blocks in the .tf files; see README 'O que o plan deve mostrar')"
{ cat ./*.tf | grep -E '^resource "' || true; } | awk '{ gsub(/"/, "", $2); print $2 }' | sort | uniq -c

if [ "$failures" -gt 0 ]; then
  echo "validate.sh: $failures failure(s)"
  exit 1
fi
echo "validate.sh: all checks passed"
