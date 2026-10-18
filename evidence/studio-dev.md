# ApiSeal: Studio Devnet Target & Verification Evidence

## Target Environment Specifications

ApiSeal explicitly targets the **GenLayer Studio development preview** (Studio Devnet), running the v0.6 release-candidate consensus toolchain:

| Parameter | Specification | Notes |
| :--- | :--- | :--- |
| **Network Name** | GenLayer Studio Devnet | Dedicated preview network for upcoming protocol stack |
| **Network Preset** | `studioDevnet` (SDK) / `studio_devnet` (gltest) | Built-in definition in `genlayer-js/chains` and `gltest` |
| **Canonical RPC** | `https://studio-dev.genlayer.com/api` | Development preview endpoint |
| **Chain ID** | `61997` | Distinct from Studionet (`61999`) and Localnet (`61127`) |
| **Native Token** | GEN (18 decimals) | Testnet faucet tokens |
| **Consensus Engine** | Optimistic Democracy v0.6 RC | Equivalence principle validation with `gl.vm.run_nondet_unsafe` |

> [!IMPORTANT]
> **Network Disambiguation**:
> - Studio Devnet (`chain ID 61997`) is the dedicated preview network.
> - Hosted Studionet (`chain ID 61999`) is the separate stable sandbox environment.
> ApiSeal strictly isolates configurations to avoid cross-chain replay or incorrect node targeting.

---

## Toolchain & Runtime Dependencies

| Tool / Dependency | Version / Identifier | Purpose |
| :--- | :--- | :--- |
| **GenVM Runner** | `py-genlayer:babwp9t37jw9g4j2bccgn14g6x7x9s1f7dsmh7emvz735pz4zxa0` | v0.6.0-rc9 runner artifact bundle |
| **genvm-linter** | `0.11.0` | AST safety checks, schema generation, type validation |
| **genlayer-py** | `0.19.0rc2` | Python smart contract types, ABI codecs, and storage |
| **genlayer-test** | `0.30.0rc2` | Test runner, simulator stubs, transaction assertions |
| **genlayer-js** | `2.0.0-rc.1` | TypeScript SDK client with native `studioDevnet` support |
| **Python** | `3.12.10` | Intelligent Contract authoring environment |
| **TypeScript / Node** | `TypeScript 5.7.2` / `Node.js v22` | Deployment scripts, fee estimation, and on-chain verification |

---

## Contract Integrity & Canonical Source Hash

- **Contract Path**: `contracts/apiseal.py`
- **Source SHA-256**: `d8bc72dc110f0ea9295107ffefecff021f175fe19c7a38de6ae5425e00a61587`
- **Character Count**: `37,736`
- **Total Lines**: `1,005`

---

## Static Analysis & ABI Validation Evidence

### 1. `genvm-lint check` (AST Safety & Contract Validation)
Command executed:
```bash
genvm-lint check contracts/apiseal.py
```
Output:
```text
✓ Lint passed (3 checks)
✓ Validation passed
  Contract: ApiSeal
  Methods: 11 (6 view, 5 write)
```

### 2. ABI Schema Extraction & Parity (`genvm-lint schema`)
Local command:
```bash
genvm-lint schema -o deploy/schema.json --json contracts/apiseal.py
```
Public CI verification:
In GitHub Actions CI, the schema is generated to a temporary file (`/tmp/schema_check/schema.json`) and compared byte-for-byte with `deploy/schema.json` via `diff -u`. Stale schema causes CI failure.

Tracked schema output (`deploy/schema.json`):
```json
{
  "ctor": {
    "params": [
      ["owner", "address"],
      ["project_id", "string"],
      ["review_window_seconds", "int"]
    ],
    "kwparams": {}
  },
  "methods": {
    "cancel_proposal": { "params": [], "kwparams": {}, "readonly": false, "ret": "null", "payable": false },
    "expire_proposal": { "params": [], "kwparams": {}, "readonly": false, "ret": "null", "payable": false },
    "get_config": { "params": [], "kwparams": {}, "readonly": true, "ret": "dict" },
    "get_current_release": { "params": [], "kwparams": {}, "readonly": true, "ret": "dict" },
    "get_history": { "params": [["index", "int"]], "kwparams": {}, "readonly": true, "ret": "dict" },
    "get_history_count": { "params": [], "kwparams": {}, "readonly": true, "ret": "int" },
    "get_pending_proposal": { "params": [], "kwparams": {}, "readonly": true, "ret": "dict" },
    "propose_release": {
      "params": [
        ["candidate_url", "string"],
        ["candidate_sha256", "string"],
        ["major", "int"],
        ["minor", "int"],
        ["patch", "int"]
      ],
      "kwparams": {},
      "readonly": false,
      "ret": "null",
      "payable": false
    },
    "recompute_history_result": { "params": [["index", "int"]], "kwparams": {}, "readonly": true, "ret": "string" },
    "register_baseline": {
      "params": [
        ["manifest_json", "string"],
        ["major", "int"],
        ["minor", "int"],
        ["patch", "int"]
      ],
      "kwparams": {},
      "readonly": false,
      "ret": "null",
      "payable": false
    },
    "review_release": { "params": [], "kwparams": {}, "readonly": false, "ret": "null", "payable": false }
  }
}
```

---

## Direct Test Suite Results

Test Command:
```bash
pytest tests/direct/test_apiseal.py -v
```

Execution Summary: **38 passed in 0.28s**

| # | Test Identifier | Verification Focus | Status |
| :--- | :--- | :--- | :--- |
| 1 | `test_01_exact_manifest_schema_and_unknown_key_rejection` | Reject unexpected/missing keys at all manifest levels | **PASSED** |
| 2 | `test_02_malformed_json` | Parse strictly with `json.loads`; reject syntax errors and empty strings | **PASSED** |
| 3 | `test_03_nested_or_duplicate_ids` | Enforce ID uniqueness and lowercase regex `^[a-z][a-z0-9_]*$` | **PASSED** |
| 4 | `test_04_all_length_and_count_boundaries` | Enforce api_name (1..64), surfaces (1..12), path, contracts, 12K size cap | **PASSED** |
| 5 | `test_05_boolean_as_integer_rejection` | Reject `bool` instances for all numeric arguments | **PASSED** |
| 6 | `test_06_url_and_sha_validation` | Enforce HTTPS protocol and exact 64-hex SHA-256 strings | **PASSED** |
| 7 | `test_07_owner_authorization` | Enforce owner-only execution on baseline, propose, and cancel | **PASSED** |
| 8 | `test_08_one_pending_proposal_only` | Disallow overlapping proposals while one is pending | **PASSED** |
| 9 | `test_09_cancellation` | Owner cancellation before review clears state and logs CANCELLED | **PASSED** |
| 10 | `test_10_permissionless_expiry` | Permissionless expiry strictly after deadline logs EXPIRED | **PASSED** |
| 11 | `test_11_resolve_forbidden_after_deadline` | Revert `review_release` after deadline has passed | **PASSED** |
| 12 | `test_12_candidate_hash_mismatch` | Revert consensus when fetched body hash does not match expected SHA | **PASSED** |
| 13 | `test_13_fetch_failure` | Revert consensus on non-200 HTTP responses | **PASSED** |
| 14 | `test_14_removed_surface_is_deterministically_breaking` | Detect removed surface as BREAKING; reject minor bump | **PASSED** |
| 15 | `test_15_method_change_is_breaking` | Detect HTTP method modification as BREAKING | **PASSED** |
| 16 | `test_16_path_change_is_breaking` | Detect endpoint path modification as BREAKING | **PASSED** |
| 17 | `test_17_semantic_breaking_with_patch_is_rejected` | Semantic contract break requires major bump; reject patch | **PASSED** |
| 18 | `test_18_semantic_breaking_with_major_bump_is_accepted` | Semantic contract break accepted with major bump | **PASSED** |
| 19 | `test_19_additive_surface_with_patch_is_rejected` | Additive surface requires at least minor bump; reject patch | **PASSED** |
| 20 | `test_20_additive_surface_with_minor_bump_is_accepted` | Additive surface accepted with minor bump | **PASSED** |
| 21 | `test_21_compatible_change_with_patch_is_accepted` | Purely compatible modification accepted with patch bump | **PASSED** |
| 22 | `test_22_unclear_rejects_and_leaves_baseline_unchanged` | UNCLEAR classification rejects proposal regardless of bump | **PASSED** |
| 23 | `test_23_missing_status_id_is_rejected` | Reject model output if any common surface ID is omitted | **PASSED** |
| 24 | `test_24_invented_status_id_is_rejected` | Reject model output if hallucinated or unknown surface ID is returned | **PASSED** |
| 25 | `test_25_duplicate_statuses_rejected_and_unsorted_statuses_canonicalized` | Reject duplicate IDs; canonicalize unsorted entries alphabetically | **PASSED** |
| 26 | `test_26_prompt_injection_text_cannot_add_ids_or_control_outcome` | Resist prompt injections attempting system override or ID tampering | **PASSED** |
| 27 | `test_27_rejected_proposal_does_not_change_canonical_manifest` | Rejection preserves canonical baseline and version | **PASSED** |
| 28 | `test_28_accepted_proposal_atomically_replaces_canonical_manifest` | Acceptance atomically updates canonical manifest and version tuple | **PASSED** |
| 29 | `test_29_second_review_cannot_repeat_the_state_transition` | Revert repeat review calls once status returns to READY | **PASSED** |
| 30 | `test_30_history_cap_and_proposal_bounds` | Bound history to maximum 10 items (FIFO eviction) | **PASSED** |
| 31 | `test_31_recomputed_history_result_matches_stored_terminal_result` | Pure re-derivation confirms exact deterministic agreement | **PASSED** |
| 32 | `test_32_model_schema_top_level_extra_keys_adversarial` | Adversarial test: reject model responses with top-level extra keys | **PASSED** |
| 33 | `test_33_model_schema_item_level_extra_keys_adversarial` | Adversarial test: reject model responses with item-level extra keys | **PASSED** |
| 34 | `test_34_zero_owner_address_rejected` | Rejection of zero address owner in constructor | **PASSED** |
| 35 | `test_35_version_component_upper_bounds` | Version component upper bound enforcement (<= 1,000,000) | **PASSED** |
| 36 | `test_36_timestamp_failure_cannot_create_zero_based_deadline` | Fail closed on timestamp failure without setting zero-based deadline | **PASSED** |
| 37 | `test_37_history_recomputation_comprehensive_matrix` | Comprehensive matrix for breaking/additive/compatible transitions | **PASSED** |
| 38 | `test_38_recomputation_survives_subsequent_canonical_version_advances` | Recomputation determinism persists across subsequent version advances | **PASSED** |

---

## TypeScript Build & Scripts Verification

1. **Typecheck**:
   ```bash
   npx tsc --noEmit
   ```
   Result: **PASSED (0 errors)**

2. **Cross-Platform Script Execution Verification**:
   - **Windows PowerShell / CMD (Local Execution)**:
     - `npm run deploy:studio-dev` (without private key): Visibly executes and fails with `ERROR: No private key provided. Set GENLAYER_PRIVATE_KEY or PRIVATE_KEY env variable.` (Exit code: 1).
     - `npm run verify:onchain` (without address): Visibly executes and fails with `ERROR: No contract address provided.` (Exit code: 1).
     - Neither command silently exits 0 on Windows.
   - **Ubuntu Linux (Public CI Execution)**:
     - TypeScript compilation passed without errors (`npx tsc --noEmit`).
     - Guarded fail-closed execution verified in CI workflow for `npm run deploy:studio-dev` and `npm run verify:onchain`.

3. **Fee Estimation & Deployment Address Extraction**:
   - Deployment script explicitly calls `client.estimateTransactionFees()` and passes `{ distribution, feeValue, messageAllocations }` into `client.deployContract(...)`.
   - Extraction authoritatively resolves `receipt.txDataDecoded?.contractAddress`, with carefully guarded receipt fallbacks.
   - Script appends deployment records to `evidence/studio-dev.md` when finalized.

---

## Canonical Local Fixtures & Live Integration Specification

### Canonical Local Fixtures (`fixtures/`)
All fixtures are stored as byte-for-byte canonical compact JSON (`sort_keys=True, separators=(",", ":")` with no trailing whitespace or extra newlines):
- `fixtures/v1.0.1-compatible.json` (SHA-256: `5d1c3fe497e44fc95a704e7ae49fb0c99a4af0b6b99fa12afdef0a959681701c`): Canonical compact JSON specifying backward-compatible updates to `create_charge` (used in live tests 01 and 04).
- `fixtures/v1.0.1-additive.json` (SHA-256: `1c7d2fe54ae97fea4d82cbb112a243f8e16e10a2ff84430bfbdce3c75ecde888`): Canonical compact JSON introducing additive `/refunds` endpoint (`refund_charge`, used in live test 02).
- `fixtures/v2.0.0-breaking.json` (SHA-256: `5741ab9a04bfe5f418d7590d2c9825e2d8ddc89a6438c0927c3d32d7496a5073`): Canonical compact JSON introducing breaking `/v2/charges` path change (offline reference example fixture only; non-live and not claimed as live proof).

### Live Integration Test Suite Requirements
The test suite in [`tests/integration/test_apiseal_live.py`](../tests/integration/test_apiseal_live.py) contains 4 end-to-end tests:
1. `test_integration_01_accepted_compatible_release`: Validates multi-validator consensus on compatible candidate promotion.
2. `test_integration_02_rejected_insufficient_version`: Validates deterministic rejection when an additive surface (`refund_charge`) is paired with an insufficient patch bump (1.0.1).
3. `test_integration_03_hash_mismatch_or_fetch_failure`: Validates fail-closed transaction revert on SHA mismatch / 404 fetch failure.
4. `test_integration_04_repeat_review_revert`: Validates revert on repeat review calls when state is no longer pending.

#### 1. Explicit Opt-In Guard (`APISEAL_RUN_LIVE_TESTS=1`)
Every test in `tests/integration/test_apiseal_live.py` includes an autouse fixture:
```python
if os.environ.get("APISEAL_RUN_LIVE_TESTS") != "1":
    pytest.skip(...)
```
Without `APISEAL_RUN_LIVE_TESTS=1`, all 4 tests unconditionally skip before deploying any contract or submitting any transactions.

#### 2. Byte-for-Byte Authoritative Fixtures
The `load_authoritative_fixture(fixture_name)` helper loads the local canonical JSON fixture from `fixtures/` as raw UTF-8 text, validates that `raw_text == json.dumps(parsed, sort_keys=True, separators=(",", ":"))`, and computes `candidate_sha256` from those exact bytes.
When `APISEAL_RUN_LIVE_TESTS=1` is set, tests require commit-pinned public URLs serving identical bytes:
- `APISEAL_LIVE_COMPATIBLE_FIXTURE_URL`: Required for Test 01 and Test 04 (matching `fixtures/v1.0.1-compatible.json`).
- `APISEAL_LIVE_ADDITIVE_FIXTURE_URL`: Required for Test 02 (matching `fixtures/v1.0.1-additive.json`).
- If either variable is absent during live execution, the corresponding test skips with an explicit message.

#### 3. Verified Immutable Public Fixture Proofs
- **Commit SHA**: `c5f6a834bb6ff51f63862b660389e4e795290a05`
- **Compatible Fixture URL**: `https://raw.githubusercontent.com/edwarderlick/ApiSeal/c5f6a834bb6ff51f63862b660389e4e795290a05/fixtures/v1.0.1-compatible.json`
  - Byte count: `542` bytes
  - Computed SHA-256: `5d1c3fe497e44fc95a704e7ae49fb0c99a4af0b6b99fa12afdef0a959681701c`
  - Byte-for-byte equality verified: **PASS**
- **Additive Fixture URL**: `https://raw.githubusercontent.com/edwarderlick/ApiSeal/c5f6a834bb6ff51f63862b660389e4e795290a05/fixtures/v1.0.1-additive.json`
  - Byte count: `712` bytes
  - Computed SHA-256: `1c7d2fe54ae97fea4d82cbb112a243f8e16e10a2ff84430bfbdce3c75ecde888`
  - Byte-for-byte equality verified: **PASS**

---

## Pre-Deployment Verification Summary

- [x] 38 direct unit tests passing locally and in public CI (`pytest tests/direct/test_apiseal.py`).
- [x] AST safety validation passed locally and in CI (`genvm-lint check contracts/apiseal.py`).
- [x] ABI schema validation and byte-for-byte parity passed locally and in CI (`genvm-lint schema`).
- [x] TypeScript compilation passed locally and in CI (`npx tsc --noEmit`).
- [x] Integration test suite skipped safely without live opt-in (`pytest tests/integration/test_apiseal_live.py`).
- [x] Public GitHub Actions CI workflow passed ([run #39100985057](https://github.com/edwarderlick/ApiSeal/actions/runs/39100985057), commit `57072c75d2bce74e9f7aa00f19f3a23fca264540`).
- [x] Guarded fail-closed script execution verified on Windows (locally) and Ubuntu Linux (CI).
- [x] Real fee estimation and authoritative `txDataDecoded` address extraction implemented.
- [x] Canonical source SHA-256 computed: `d8bc72dc110f0ea9295107ffefecff021f175fe19c7a38de6ae5425e00a61587`.
- [ ] Deployed-source parity — pending deployment and successful `getContractCode` byte-for-byte comparison.
- [x] No deployment and zero live transactions executed (Phase A complete; live integration and deployment pending).
