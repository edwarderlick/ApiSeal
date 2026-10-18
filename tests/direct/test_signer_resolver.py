"""
Offline unit tests for ApiSeal Signer Resolver and Guards.

Verifies:
1. Missing keychain/environment key fails closed without transaction submission.
2. Invalid key formats fail cleanly with clear diagnostic errors.
3. No secret or private key material appears in exceptions, stdout, or stderr.
4. Only the public deployer address is derived and logged.
5. Contract factory resolves ApiSeal directly using public get_contract_factory API.
6. Contract source hash remains strictly canonical.
"""

import hashlib
import os
import subprocess
import sys
from pathlib import Path

project_root = Path(__file__).resolve().parent.parent.parent
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

import pytest
from gltest import get_contract_factory
from tests.integration.test_apiseal_live import get_live_signer

CANONICAL_HASH = "d8bc72dc110f0ea9295107ffefecff021f175fe19c7a38de6ae5425e00a61587"
SAMPLE_KEY = "0x" + "ab" * 32
SAMPLE_ADDR = "0x98522369C9e1B9fEE4F8c5384B29a0088537537b"


def test_contract_source_hash_unchanged():
    """Verify that contracts/apiseal.py has not been modified."""
    contract_path = Path(__file__).resolve().parent.parent.parent / "contracts" / "apiseal.py"
    data = contract_path.read_bytes()
    computed = hashlib.sha256(data).hexdigest()
    assert computed == CANONICAL_HASH, f"Contract hash mismatch: {computed} != {CANONICAL_HASH}"


def test_missing_private_key_fails_closed_without_leakage(monkeypatch):
    """Verify get_live_signer fails when key is absent, without leaking credentials."""
    monkeypatch.delenv("GENLAYER_PRIVATE_KEY", raising=False)
    monkeypatch.delenv("PRIVATE_KEY", raising=False)

    with pytest.raises(pytest.fail.Exception) as excinfo:
        get_live_signer()

    msg = str(excinfo.value)
    assert "Live network execution requires GENLAYER_PRIVATE_KEY or PRIVATE_KEY" in msg
    assert "0x" not in msg


def test_invalid_private_key_format_fails_closed(monkeypatch):
    """Verify invalid private key formats fail without leaking key content."""
    monkeypatch.setenv("GENLAYER_PRIVATE_KEY", "0xdeadbeef_invalid_length")

    with pytest.raises(pytest.fail.Exception) as excinfo:
        get_live_signer()

    msg = str(excinfo.value)
    assert "Invalid GENLAYER_PRIVATE_KEY format" in msg
    assert "0xdeadbeef" not in msg


def test_valid_private_key_logs_only_public_address(monkeypatch, capsys):
    """Verify valid private key creates account and logs only public address."""
    monkeypatch.setenv("GENLAYER_PRIVATE_KEY", SAMPLE_KEY)

    account = get_live_signer()
    captured = capsys.readouterr()

    # Public address must be derived and logged
    assert len(account.address) == 42
    assert account.address.startswith("0x")
    assert account.address in captured.out
    # Private key must NOT appear anywhere in output
    assert SAMPLE_KEY not in captured.out
    assert SAMPLE_KEY not in captured.err


def test_public_get_contract_factory_resolution():
    """Verify get_contract_factory('ApiSeal') resolves directly without fallback."""
    cf = get_contract_factory("ApiSeal")
    assert cf.contract_name == "ApiSeal"
    assert len(cf.contract_code) > 0


def test_node_signer_missing_keychain_fails_closed():
    """
    Verify Node/TypeScript resolveSigner fails closed when an unconfigured
    account name is requested and no environment variables are present.
    """
    ts_code = """
import { resolveSigner } from './deploy/signer.ts';
try {
  await resolveSigner({ accountName: 'nonexistent-test-account-xyz', checkBalance: false });
  process.exit(2);
} catch (err) {
  const msg = (err && err.message) || String(err);
  if (msg.includes("could not be resolved from OS keychain")) {
    console.log("EXPECTED_FAIL_CLOSED_CONFIRMED");
    process.exit(0);
  }
  process.exit(1);
}
"""
    res = subprocess.run(
        ["npx", "tsx"],
        input=ts_code,
        cwd=str(Path(__file__).resolve().parent.parent.parent),
        capture_output=True,
        text=True,
        shell=sys.platform == "win32",
    )
    assert res.returncode == 0, f"Process failed: stdout={res.stdout}, stderr={res.stderr}"
    assert "EXPECTED_FAIL_CLOSED_CONFIRMED" in res.stdout
