# ApiSeal: Studio Devnet Target & Verification Evidence

## Target Environment Specifications

ApiSeal explicitly targets the **GenLayer Studio development preview** (Studio Devnet), running the v0.6 release-candidate consensus toolchain:

| Parameter | Specification | Notes |
| :--- | :--- | :--- |
| **Network Name** | GenLayer Studio Devnet | Dedicated preview network for protocol stack |
| **Network Preset** | `studioDevnet` (SDK) / `studio_devnet` (gltest) | Built-in definition in `genlayer-js/chains` and `gltest` |
| **Canonical RPC** | `https://studio-dev.genlayer.com/api` | Development preview JSON-RPC endpoint |
| **Chain ID** | `61997` | Distinct from Studionet (`61999`) and Localnet (`61127`) |
| **Native Token** | GEN (18 decimals) | Faucet testnet tokens |
| **Consensus Engine** | Optimistic Democracy | Multi-validator equivalence validation via `gl.vm.run_nondet` |
| **Target Runner** | `py-genlayer:5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng` | Accepted Studio Devnet GenVM execution bundle |

> [!IMPORTANT]
> **Network Disambiguation**:
> - Studio Devnet (`chain ID 61997`) is the preview network currently running active validators.
> - Hosted Studionet (`chain ID 61999`) is the separate stable sandbox environment.
> ApiSeal strictly isolates configurations to avoid cross-chain replay or incorrect node targeting.

---

## Toolchain & Runtime Dependencies

| Tool / Dependency | Version / Identifier | Purpose |
| :--- | :--- | :--- |
| **Target GenVM Runner** | `py-genlayer:5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng` | Studio Devnet accepted execution environment |
| **genvm-linter** | `0.11.0` | AST safety checks, schema generation, type validation |
| **genlayer-py** | `0.19.0rc2` | Python smart contract types, ABI codecs, and storage |
| **genlayer-test** | `0.30.0rc2` | Test runner, simulator stubs, transaction assertions |
| **genlayer-js** | `2.0.0-rc.1` | TypeScript SDK client with native `studioDevnet` support |
| **Python** | `3.12.10` | Intelligent Contract authoring environment |
| **TypeScript / Node** | `TypeScript 5.7.2` / `Node.js v22` | Deployment scripts, fee estimation, and on-chain verification |

---

## Canonical Contract Integrity & Source Hashes

- **Contract Path**: `contracts/apiseal.py`
- **Canonical Source SHA-256**: `0ce6c6c3a5d5dc4dc00411ce35dcc89a15c197f8d79e02cd01b22dccbb45c602`
- **Character Count**: `37,710` bytes
- **Total Lines**: `1,004`
- **ABI Schema SHA-256**: `30af51d95e9613ac8595eacda8375b3af87416b95bfc7bdc65cd0717e7884378`
- **Historical Pre-Port Source Hash**: `d8bc72dc110f0ea9295107ffefecff021f175fe19c7a38de6ae5425e00a61587` (Runner `babwp9t...` was malformed on Studio Devnet)

---

## Historical & Diagnostic Deployments (Separation of Records)

### 1. Failed Historical ApiSeal Attempt (Runner Incompatibility)
- **Transaction Hash**: `0x32afea2a943b1b3817e0f185b14779947f49dbe835ede0de779677df9f213899`
- **Intended Contract Address**: `0x6c64Cb4BA596a1dd40440Fb045B9e71d047786e5` (**Contract was NOT created**)
- **Consensus Status**: `FINALIZED` (Status 7)
- **Execution Result**: `FINISHED_WITH_ERROR`
- **Reported Leader Error**: `invalid_contract runner malformed`
- **Diagnosis**: The previously assumed runner (`py-genlayer:babwp9t37jw9g4j2bccgn14g6x7x9s1f7dsmh7emvz735pz4zxa0`) was not accepted by active Studio Devnet validator nodes.

### 2. Noncanonical Compatibility-Control Contract
- **Contract Address**: `0x6c7ab7e40B6C9870F58D0304E3B5EE062d127B1C`
- **Runner**: `py-genlayer:5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng`
- **Source SHA-256**: `a8559f9c732b7db85c0573a63010a2b56d58e0fb8322abf76e70469ff2e04336`
- **Status**: Successful deployment proof for the `5jycge...` runner. Not canonical ApiSeal source.

### 3. Phase 5: Disposable Live Canary
Before executing the full ApiSeal integration scenarios, a disposable canary was deployed to prove end-to-end validator consensus using the target runner and required nondeterministic APIs:
- **Contract Address**: `0x75093F8FfE8C7aCDafDec65699A7d97eFf0e5b5b`
- **Deploy Transaction Hash**: `0xc8bcfd4f6ab4468ccfb086ac556fb424ce4f11a416840df8afc5b7fa7efb9b34`
  - Consensus: `MAJORITY_AGREE`, Execution: `FINISHED_WITH_RETURN`
- **Nondeterministic Write Transaction Hash (`exercise_nondet`)**: `0x8cb623af7ae7d85391ff5379c7d736d6f91b85d2ef8a0ed5671018130c2bda00`
  - Exercised: `gl.nondet.web.get` + `gl.nondet.exec_prompt` + `gl.vm.run_nondet`
  - Consensus: `MAJORITY_AGREE`, Execution: `FINISHED_WITH_RETURN`
- **Readback Result**: `get_status()` returned `"SUCCESS"`
- **Canary Result**: **PASSED** (Diagnostic evidence proving target runtime acceptance).

---

## Phase 6: Four Real Live Integration Scenarios (Passed)

All 4 integration scenarios were executed against disposable candidate contracts on Studio Devnet using immutable, commit-pinned fixtures (`c5f6a834bb6ff51f63862b660389e4e795290a05`). The test harness uses public `genlayer-js` APIs with zero monkey patching.

Detailed machine-readable receipt saved in: [`evidence/live_scenarios_receipt.json`](live_scenarios_receipt.json).

### Summary Table

| Scenario # | Focus | Disposable Contract Address | Key Transaction Hash | Consensus & GenVM Execution | Result |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Scenario 1** | Compatible release accepted | `0x073df726542937D4494EF7c86dD2ab373ac96B49` | `0xabb2ae2a79ca8bd6e87b7b5b193f0ae928bb800218ee53bf634d7dc34dcec955` (review) | `MAJORITY_AGREE` / `FINISHED_WITH_RETURN` | **PASSED** (Promoted to v1.0.1) |
| **Scenario 2** | Insufficient bump rejected | `0x3C8541F4Eed44539f9748Dd8790E7c83828B6f87` | `0xe1a28e61d21921e12e8b22c7084310318b3201dec2f1cd356d3d62abec7e438c` (review) | `MAJORITY_AGREE` / `FINISHED_WITH_RETURN` | **PASSED** (Deterministic rejection; baseline retained) |
| **Scenario 3** | Hash mismatch / fetch failure | `0x834cd190D05deEA20816190A4212B41519CD0351` | `0xd8ee84c588001e3ae12acd918fa5e81cbd7eb5cb568340e4c30ad9d7f5cce23f` (review) | `MAJORITY_AGREE` / `FINISHED_WITH_ERROR` | **PASSED** (Failed closed with revert; state remained PENDING) |
| **Scenario 4** | Repeated review prevented | `0xAcD0a05625E48566A163451dc19e318515b64B1E` | `0xd99662988b1573f1a21ef2456e50f34854e057d360ea75e9ca3c332414a541c4` (repeat review) | `MAJORITY_AGREE` / `FINISHED_WITH_ERROR` | **PASSED** (Repeat review reverted; state preserved READY) |

### Detailed Scenario Receipts

#### Scenario 1: Compatible Release Accepted
- **Candidate Contract**: `0x073df726542937D4494EF7c86dD2ab373ac96B49`
- **Deploy Tx**: `0x56f37fa88671c8c72d91136f9f0bf80ce44a1dcc4a2666a9684305c8e4220c20` (`FINISHED_WITH_RETURN`)
- **Register Baseline Tx**: `0xb52a792124b0251fbde9db439cb98778f9af01a8c03365469fba55379c495673` (`FINISHED_WITH_RETURN`)
- **Propose Release Tx**: `0x58ffed27322961d0ac4b6eb6e218aaa5881cd55d637c46f49e1fd53af30c2cc1` (`FINISHED_WITH_RETURN`)
- **Review Release Tx**: `0xabb2ae2a79ca8bd6e87b7b5b193f0ae928bb800218ee53bf634d7dc34dcec955` (`FINISHED_WITH_RETURN`)
- **Observed State Readback**: `accepted_release_count = 1`, `current_version = {1, 0, 1}`, `canonical_manifest_sha256 = 5d1c3fe4...`

#### Scenario 2: Insufficient Version Bump Rejected
- **Candidate Contract**: `0x3C8541F4Eed44539f9748Dd8790E7c83828B6f87`
- **Deploy Tx**: `0xcd4cca4a6a88fbab22b01b6ed48a7f1bb7759e7b65df8d85370ed949b93c667b` (`FINISHED_WITH_RETURN`)
- **Register Baseline Tx**: `0x466eb42cbb857a62806970fee192632e529f7836f544517d7af2326bc0743e87` (`FINISHED_WITH_RETURN`)
- **Propose Release Tx**: `0xec42cba788474f890591326ee07277e5ed4fcc566dbb8dfa268c4cc021266fae` (`FINISHED_WITH_RETURN`)
- **Review Release Tx**: `0xe1a28e61d21921e12e8b22c7084310318b3201dec2f1cd356d3d62abec7e438c` (`FINISHED_WITH_RETURN`)
- **Observed State Readback**: `rejected_release_count = 1`, `current_version = {1, 0, 0}` (unchanged), history entry: `terminal_result = REJECTED`, `added_ids = ["refund_charge"]`.

#### Scenario 3: Hash Mismatch / Fetch Failure Reverted
- **Candidate Contract**: `0x834cd190D05deEA20816190A4212B41519CD0351`
- **Deploy Tx**: `0x8b28744cf2e83e8e03a136b60d6c64b61af2dbde74e5892daba86dcdf06519d4` (`FINISHED_WITH_RETURN`)
- **Register Baseline Tx**: `0x00aa424336c063a0494e2564c8d43fcef5fb5e8ec9e49bf196224e960e0b728a` (`FINISHED_WITH_RETURN`)
- **Propose Release Tx**: `0x453c3708420d07144e5344b6d9ea2336e0f88b4bc33deeea930b27814a18386c` (`FINISHED_WITH_RETURN`)
- **Review Release Tx**: `0xd8ee84c588001e3ae12acd918fa5e81cbd7eb5cb568340e4c30ad9d7f5cce23f` (`FINISHED_WITH_ERROR`)
- **Observed State Readback**: Review transaction reverted as expected under validator consensus. Contract status remained `PENDING` (fail-closed integrity preserved).

#### Scenario 4: Repeated Review Revert Workflow
- **Candidate Contract**: `0xAcD0a05625E48566A163451dc19e318515b64B1E`
- **Deploy Tx**: `0x6df54a56c6a60ddcf3278452604bb5455a416a948c06a5e56698db62d0d11eb5` (`FINISHED_WITH_RETURN`)
- **Register Baseline Tx**: `0xc32dd317b76f15442e5351377124ab5de5f7ede93143eb205c6f44c8d4a7cdad` (`FINISHED_WITH_RETURN`)
- **Propose Release Tx**: `0xf98e1348ace2ddf61535a43ca15fdda930b4bfba8e8d6bdfafeb6cc32e5ff6e6` (`FINISHED_WITH_RETURN`)
- **First Review Tx**: `0x7de71718ab125d4dc89ba163ea738fc973504110492b064a04eae793f2f9e973` (`FINISHED_WITH_RETURN`, status transitioned to `READY`)
- **Second Review Tx (Repeat)**: `0xd99662988b1573f1a21ef2456e50f34854e057d360ea75e9ca3c332414a541c4` (`FINISHED_WITH_ERROR`)
- **Observed State Readback**: Repeat review reverted immediately with GenVM error. Status remained `READY`.

---

## Phase 7: Canonical Deployment Record & On-Chain Parity

Following the successful execution of the Canary and all 4 Live Integration Scenarios, the final canonical contract was deployed to Studio Devnet:

| Property | Value |
| :--- | :--- |
| **Canonical Contract Address** | `0xA631C30A79e69695a8d17D21F4F2497Ff52522A4` |
| **Deployment Transaction Hash** | `0xd888072437a572b8c1b33b10cf18b7fabbf46be9fa114d78cee0a2c791c6a542` |
| **Deployer Public Address** | `0x9CE8B4b8A355421f01779Ebd0c49e22A8F1FF0DD` (`coverlock-submitter`) |
| **Network** | GenLayer Studio Devnet Preview (Chain ID: `61997`) |
| **Consensus Result** | `FINALIZED` (Status 7, `MAJORITY_AGREE`) |
| **GenVM Execution Result** | `FINISHED_WITH_RETURN` |
| **Local Source SHA-256** | `0ce6c6c3a5d5dc4dc00411ce35dcc89a15c197f8d79e02cd01b22dccbb45c602` |
| **On-Chain Source SHA-256** | `0ce6c6c3a5d5dc4dc00411ce35dcc89a15c197f8d79e02cd01b22dccbb45c602` |
| **Byte-For-Byte Parity Proof** | **PASS** (100% exact character match: 37,710 bytes via `gen_getContractCode`) |
| **Explorer Contract Link** | [0xA631C30A79e69695a8d17D21F4F2497Ff52522A4](https://explorer-studio-dev.genlayer.com/contract/0xA631C30A79e69695a8d17D21F4F2497Ff52522A4) |
| **Explorer Transaction Link** | [0xd888072437a572b8...](https://explorer-studio-dev.genlayer.com/tx/0xd888072437a572b8c1b33b10cf18b7fabbf46be9fa114d78cee0a2c791c6a542) |

### Initialized State Readback Verification

The following safe view methods were executed against the canonical contract address to confirm clean initialization:

```json
{
  "get_config": {
    "owner": "0x9CE8B4b8A355421f01779Ebd0c49e22A8F1FF0DD",
    "project_id": "org.genlayer.apiseal",
    "review_window_seconds": 86400,
    "status": "UNINITIALIZED"
  },
  "get_current_release": {
    "current_version": {"major": 0, "minor": 0, "patch": 0},
    "canonical_manifest": "",
    "canonical_manifest_sha256": "",
    "accepted_release_count": 0,
    "rejected_release_count": 0,
    "cancelled_count": 0,
    "expired_count": 0
  },
  "get_pending_proposal": {
    "proposal_nonce": 0,
    "candidate_url": "",
    "candidate_sha256": "",
    "proposed_version": {"major": 0, "minor": 0, "patch": 0},
    "pending_timestamp": 0,
    "review_deadline": 0
  },
  "get_history_count": 0
}
```

---

## Static Analysis & ABI Validation Evidence

### 1. `genvm-lint check` (AST Safety & Contract Validation)
```text
✓ Lint passed (3 checks)
✓ Validation passed
  Contract: ApiSeal
  Methods: 11 (6 view, 5 write)
```

### 2. ABI Schema Extraction & Parity (`genvm-lint schema`)
The schema extracted from `contracts/apiseal.py` is byte-for-byte identical to tracked [`deploy/schema.json`](../deploy/schema.json) (SHA-256: `30af51d95e9613ac8595eacda8375b3af87416b95bfc7bdc65cd0717e7884378`).

---

## Offline Direct Test Suite Results

Test Command:
```bash
pytest tests/direct -v
```

Execution Summary: **44 passed in 0.32s** (100% pass offline)

- Covers exact manifest parsing, AST inspection, boundary checking, SemVer rules, malicious inputs, fail-closed handling, history recomputation, and signer resolution.

---

## Public Fixture Hashes & Commit-Pinned URLs

| Fixture Name | Path | SHA-256 | Commit-Pinned URL |
| :--- | :--- | :--- | :--- |
| **Compatible Patch** | `fixtures/v1.0.1-compatible.json` | `5d1c3fe497e44fc95a704e7ae49fb0c99a4af0b6b99fa12afdef0a959681701c` | [v1.0.1-compatible.json](https://raw.githubusercontent.com/edwarderlick/ApiSeal/c5f6a834bb6ff51f63862b660389e4e795290a05/fixtures/v1.0.1-compatible.json) |
| **Additive Minor** | `fixtures/v1.0.1-additive.json` | `1c7d2fe54ae97fea4d82cbb112a243f8e16e10a2ff84430bfbdce3c75ecde888` | [v1.0.1-additive.json](https://raw.githubusercontent.com/edwarderlick/ApiSeal/c5f6a834bb6ff51f63862b660389e4e795290a05/fixtures/v1.0.1-additive.json) |
| **Breaking Reference** | `fixtures/v2.0.0-breaking.json` | `5741ab9a04bfe5f418d7590d2c9825e2d8ddc89a6438c0927c3d32d7496a5073` | Reference example |

---

## Public CI Workflow Verification

- **Workflow File**: `.github/workflows/verify.yml`
- **Latest Green Main CI Run**: [run #39117994324](https://github.com/edwarderlick/ApiSeal/actions/runs/39117994324)
- **Commit**: `f51e2d4`
- **Verified Checks**:
  1. GenVM v0.6.0-rc8 runner environment setup
  2. AST linting and contract validation (`genvm-lint check contracts/apiseal.py`)
  3. ABI schema extraction and byte-for-byte parity against tracked `deploy/schema.json`
  4. 44 direct contract unit tests and autonomous signer tests (`pytest tests/direct -q`)
  5. Default live integration suite skips cleanly without live opt-in (`pytest tests/integration/test_apiseal_live.py -q`)
  6. TypeScript compilation (`npx tsc --noEmit`)
  7. Fail-closed deployment guard verification on Linux
  8. Live on-chain source parity verification against GenLayer Studio Devnet (`npm run verify:onchain`)

---

## Final Verification Checklist

- [x] **Zero gltest internal monkey patches**: All private `gltest` hooks removed; pure public `genlayer-js` APIs used for live execution.
- [x] **Disposable Canary Executed & Passed**: Verified `gl.nondet.web.get`, `gl.nondet.exec_prompt`, and `gl.vm.run_nondet` with terminal consensus.
- [x] **All 4 Live Integration Scenarios Passed**: Full consensus lifecycle proven for compatible release, insufficient bump rejection, hash mismatch revert, and repeated review prevention.
- [x] **Canonical Contract Deployed**: Address `0xA631C30A79e69695a8d17D21F4F2497Ff52522A4`.
- [x] **Deployed-Source Parity Proven**: Byte-for-byte exact match verified on-chain via `gen_getContractCode`.
- [x] **No Secrets Exposed**: Resolved via autonomous OS keychain with best-effort reference cleanup; zero keys printed or committed.
- [x] **GenLayer Portal Statement**: **The GenLayer Portal submission has NOT yet been performed.** The repository is published, fully verified, and ready for steward review and subsequent portal submission.
