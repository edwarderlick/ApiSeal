"""
Integration and End-to-End Test Suite for ApiSeal on GenLayer.

Exercises multi-validator consensus workflows against simulated or live GenLayer networks:
1. One accepted compatible release
2. One rejected insufficient-version release
3. One hash-mismatch / fetch-failure path
4. A repeat-review revert

EXPLICIT LIVE TEST OPT-IN:
All tests in this module require an explicit environment variable:
    APISEAL_RUN_LIVE_TESTS=1
Without this exact value, every test skips before deploying a contract
or submitting any transactions to the network.

BYTE-FOR-BYTE AUTHORITATIVE FIXTURES:
Tests 01, 02, and 04 load local canonical JSON fixtures from fixtures/
as raw UTF-8 text, verify that they are canonical compact JSON, and
calculate candidate_sha256 from those exact bytes.
The public commit-pinned URLs supplied via environment variables
(APISEAL_LIVE_COMPATIBLE_FIXTURE_URL and APISEAL_LIVE_ADDITIVE_FIXTURE_URL)
must serve byte-for-byte identical content.
"""

import hashlib
import json
import os
from pathlib import Path
import pytest

from gltest import get_contract_factory, create_account
from gltest.assertions import tx_execution_succeeded, tx_execution_failed


def load_authoritative_fixture(fixture_name: str) -> tuple[str, str]:
    """
    Load a local canonical JSON fixture from fixtures/<fixture_name>.

    Verifies that the content is strictly valid canonical compact JSON
    (compact separators, sorted keys) and calculates candidate_sha256
    from those exact UTF-8 bytes.

    Returns:
        (raw_json_text, sha256_hex)
    """
    fixture_path = Path(__file__).resolve().parent.parent.parent / "fixtures" / fixture_name
    if not fixture_path.exists():
        raise FileNotFoundError(f"Authoritative fixture not found: {fixture_path}")

    raw_text = fixture_path.read_text(encoding="utf-8")
    parsed = json.loads(raw_text)
    canonical_text = json.dumps(parsed, sort_keys=True, separators=(",", ":"))
    if raw_text != canonical_text:
        raise ValueError(
            f"Fixture {fixture_name} is not canonical compact JSON: byte discrepancy detected"
        )

    sha256_hex = hashlib.sha256(raw_text.encode("utf-8")).hexdigest()
    return raw_text, sha256_hex


def make_baseline_manifest() -> str:
    """Canonical baseline manifest for Payment Gateway API v1.0.0."""
    surfaces = [
        {
            "id": "create_charge",
            "method": "POST",
            "path": "/charges",
            "request_contract": "Amount in cents and currency",
            "response_contract": "Charge id and status",
            "behavior_contract": "Synchronously debits customer payment source",
        },
        {
            "id": "get_charge",
            "method": "GET",
            "path": "/charges/{id}",
            "request_contract": "Charge id in path",
            "response_contract": "Charge record or 404",
            "behavior_contract": "Idempotent retrieval of charge details",
        },
    ]
    surfaces = sorted(surfaces, key=lambda x: x["id"])
    obj = {"api_name": "Payment Gateway API", "surfaces": surfaces}
    return json.dumps(obj, sort_keys=True, separators=(",", ":"))


pytestmark = pytest.mark.skipif(
    os.environ.get("APISEAL_RUN_LIVE_TESTS") != "1",
    reason=(
        "Live network integration tests require explicit opt-in via APISEAL_RUN_LIVE_TESTS=1. "
        "Skipping test before contract deployment or transaction submission."
    ),
)


def get_live_signer():
    """
    Construct the live signer account from GENLAYER_PRIVATE_KEY.

    Evaluated ONLY after APISEAL_RUN_LIVE_TESTS=1 opt-in.
    Never logs or exposes the private key value.
    Fails with a clear diagnostic message if the environment variable is absent or empty.
    """
    private_key = os.environ.get("GENLAYER_PRIVATE_KEY") or os.environ.get("PRIVATE_KEY")
    if not private_key or not private_key.strip():
        pytest.fail(
            "Live network execution requires GENLAYER_PRIVATE_KEY or PRIVATE_KEY env variable. "
            "Set privately in your environment before running live tests."
        )

    key_clean = private_key.strip()
    raw_hex = key_clean[2:] if key_clean.startswith(("0x", "0X")) else key_clean

    if len(raw_hex) != 64 or not all(c in "0123456789abcdefABCDEF" for c in raw_hex):
        pytest.fail(
            "Invalid GENLAYER_PRIVATE_KEY format: expected a 64-character hex string. "
            "Never paste private keys into public forums or chat."
        )

    try:
        account = create_account(key_clean)
        print(f"\n[live-signer] Initialized live deployer account: {account.address}")
        return account
    except Exception as e:
        pytest.fail(f"Failed to initialize live signer account: {type(e).__name__}")


@pytest.fixture
def live_signer():
    """
    Guarded live signer fixture.
    Evaluated only after APISEAL_RUN_LIVE_TESTS=1 opt-in.
    Fails clearly before deployment if GENLAYER_PRIVATE_KEY is absent.
    """
    return get_live_signer()


@pytest.fixture(autouse=True)
def require_live_opt_in():
    """
    Explicit opt-in guard: skip before deploying a contract or submitting
    any transactions unless APISEAL_RUN_LIVE_TESTS=1 is explicitly set.
    """
    if os.environ.get("APISEAL_RUN_LIVE_TESTS") != "1":
        pytest.skip(
            "Live network integration tests require explicit opt-in via APISEAL_RUN_LIVE_TESTS=1. "
            "Skipping test before contract deployment or transaction submission."
        )


@pytest.fixture
def contract_factory():
    if os.environ.get("APISEAL_RUN_LIVE_TESTS") != "1":
        pytest.skip(
            "Live network integration tests require explicit opt-in via APISEAL_RUN_LIVE_TESTS=1. "
            "Skipping test before contract deployment or transaction submission."
        )
    return get_contract_factory("ApiSeal")


def test_integration_01_accepted_compatible_release(contract_factory, live_signer):
    """
    Scenario 1: Accepted compatible release workflow.
    - Owner registers baseline manifest v1.0.0 for Payment Gateway API.
    - Proposes v1.0.1 pointing to an accessible compatible candidate manifest.
    - Local fixture v1.0.1-compatible.json provides the authoritative pre-image and hash.
    - review_release executes consensus across validators.
    - Candidate is certified COMPATIBLE and promoted to canonical v1.0.1.
    """
    cand_url = os.environ.get("APISEAL_LIVE_COMPATIBLE_FIXTURE_URL")
    if not cand_url:
        pytest.skip(
            "Skipping live test: APISEAL_LIVE_COMPATIBLE_FIXTURE_URL is not set. "
            "Must provide commit-pinned public URL serving fixtures/v1.0.1-compatible.json."
        )

    cand_json, cand_sha = load_authoritative_fixture("v1.0.1-compatible.json")
    base_json = make_baseline_manifest()

    owner = live_signer
    contract = contract_factory.deploy(
        args=[owner.address, "api.payments.core", 86400],
        account=owner,
    )

    # 1. Register baseline v1.0.0
    tx_reg = contract.register_baseline(args=[base_json, 1, 0, 0]).transact()
    assert tx_execution_succeeded(tx_reg), "register_baseline transaction must succeed"

    curr = contract.get_current_release().call()
    assert curr["current_version"] == {"major": 1, "minor": 0, "patch": 0}

    # 2. Propose patch release v1.0.1 with authoritative hash
    tx_prop = contract.propose_release(args=[cand_url, cand_sha, 1, 0, 1]).transact()
    assert tx_execution_succeeded(tx_prop), "propose_release transaction must succeed"

    pending = contract.get_pending_proposal().call()
    assert pending["proposed_version"] == {"major": 1, "minor": 0, "patch": 1}
    assert pending["candidate_sha256"] == cand_sha

    # 3. Consensus review
    tx_rev = contract.review_release().transact()
    assert tx_execution_succeeded(tx_rev), "review_release transaction must succeed"

    # Verify atomic update
    curr_after = contract.get_current_release().call()
    assert curr_after["current_version"] == {"major": 1, "minor": 0, "patch": 1}
    assert curr_after["accepted_release_count"] == 1
    assert curr_after["canonical_manifest_sha256"] == cand_sha


def test_integration_02_rejected_insufficient_version(contract_factory, live_signer):
    """
    Scenario 2: Rejected release due to insufficient version bump.
    - Baseline is v1.0.0 for Payment Gateway API (create_charge, get_charge).
    - Local fixture v1.0.1-additive.json introduces added surface refund_charge.
    - Candidate proposes only a patch bump v1.0.1 instead of required minor v1.1.0.
    - Contract logic deterministically detects added surface, requiring at least minor.
    - Proposal is rejected, baseline remains v1.0.0.
    """
    cand_url = os.environ.get("APISEAL_LIVE_ADDITIVE_FIXTURE_URL")
    if not cand_url:
        pytest.skip(
            "Skipping live test: APISEAL_LIVE_ADDITIVE_FIXTURE_URL is not set. "
            "Must provide commit-pinned public URL serving fixtures/v1.0.1-additive.json."
        )

    cand_json, cand_sha = load_authoritative_fixture("v1.0.1-additive.json")
    base_json = make_baseline_manifest()

    owner = live_signer
    contract = contract_factory.deploy(
        args=[owner.address, "api.payments.core", 86400],
        account=owner,
    )

    # 1. Register baseline v1.0.0
    tx_reg = contract.register_baseline(args=[base_json, 1, 0, 0]).transact()
    assert tx_execution_succeeded(tx_reg)

    # 2. Propose patch bump v1.0.1 instead of required minor v1.1.0 for additive changes
    tx_prop = contract.propose_release(args=[cand_url, cand_sha, 1, 0, 1]).transact()
    assert tx_execution_succeeded(tx_prop)

    # 3. Consensus review
    tx_rev = contract.review_release().transact()
    assert tx_execution_succeeded(tx_rev)

    # Verification: rejected, baseline unchanged at v1.0.0
    curr_after = contract.get_current_release().call()
    assert curr_after["current_version"] == {"major": 1, "minor": 0, "patch": 0}
    assert curr_after["rejected_release_count"] == 1
    assert contract.get_history(args=[0]).call()["terminal_result"] == "REJECTED"


def test_integration_03_hash_mismatch_or_fetch_failure(contract_factory, live_signer):
    """
    Scenario 3: Hash mismatch or network fetch failure path.
    - Candidate URL fails or body hash does not match declared SHA-256.
    - Consensus fails closed with revert; pending proposal is not accepted.
    """
    base_json = make_baseline_manifest()

    owner = live_signer
    contract = contract_factory.deploy(
        args=[owner.address, "api.payments.core", 86400],
        account=owner,
    )

    contract.register_baseline(args=[base_json, 1, 0, 0]).transact()

    # Intentionally corrupt declared hash
    corrupted_sha = "f" * 64
    invalid_url = "https://studio-dev.genlayer.com/nonexistent_manifest_404.json"

    contract.propose_release(args=[invalid_url, corrupted_sha, 1, 0, 1]).transact()

    # review_release transaction must fail execution
    tx_rev = contract.review_release().transact()
    assert tx_execution_failed(tx_rev), "review_release must revert on hash mismatch or HTTP 404"

    # State remains intact and PENDING (ready to be expired or cancelled)
    config = contract.get_config().call()
    assert config["status"] == "PENDING"


def test_integration_04_repeat_review_revert(contract_factory, live_signer):
    """
    Scenario 4: Re-review revert check.
    - Baseline and compatible fixture belong to the same Payment Gateway API.
    - First review succeeds, promoting candidate and transitioning state to READY.
    - Second review on the same proposal must revert because no proposal is pending.
    """
    cand_url = os.environ.get("APISEAL_LIVE_COMPATIBLE_FIXTURE_URL")
    if not cand_url:
        pytest.skip(
            "Skipping live test: APISEAL_LIVE_COMPATIBLE_FIXTURE_URL is not set. "
            "Must provide commit-pinned public URL serving fixtures/v1.0.1-compatible.json."
        )

    cand_json, cand_sha = load_authoritative_fixture("v1.0.1-compatible.json")
    base_json = make_baseline_manifest()

    owner = live_signer
    contract = contract_factory.deploy(
        args=[owner.address, "api.payments.core", 86400],
        account=owner,
    )

    contract.register_baseline(args=[base_json, 1, 0, 0]).transact()
    contract.propose_release(args=[cand_url, cand_sha, 1, 0, 1]).transact()

    # First review succeeds and transitions state to READY
    tx_rev1 = contract.review_release().transact()
    assert tx_execution_succeeded(tx_rev1)

    # Second review must revert because status is now READY (no proposal pending)
    tx_rev2 = contract.review_release().transact()
    assert tx_execution_failed(tx_rev2), "Repeat review_release on non-PENDING state must revert"
