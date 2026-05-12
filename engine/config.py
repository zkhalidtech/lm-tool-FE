"""
LVRG Lead Magnet Engine — Config
Loads from environment only (no committed secrets). Optionally reads lm-tool/.env.local when running the CLI.
"""

import os
from pathlib import Path

try:
    from dotenv import load_dotenv
except ImportError:
    load_dotenv = None

if load_dotenv:
    _lm_tool_root = Path(__file__).resolve().parents[1]
    load_dotenv(_lm_tool_root / ".env.local")
    load_dotenv(_lm_tool_root / ".env")

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "").strip()
INSTANTLY_API_KEY = os.environ.get("INSTANTLY_API_KEY", "").strip()

# Sender identity
SENDER_NAME = "Josh"
SENDER_EMAIL = "adam@mobiloptimismrade.com"
SENDER_AGENCY = "LVRG Agency"
SENDER_WEBSITE = "lvrg.com"
SENDER_PHONE = "619.361.7484"
BOOKING_URL = "https://theresandiego.com/advertise/"

# GitHub Pages base URL for deployed previews
GITHUB_USER = "joshclifford"
GITHUB_REPO = "lvrg-previews"
PREVIEW_BASE_URL = f"https://{GITHUB_USER}.github.io/{GITHUB_REPO}"

# Output dirs
ENGINE_DIR = os.path.dirname(os.path.abspath(__file__))
SITES_DIR = os.path.join(ENGINE_DIR, "output", "sites")
EMAILS_DIR = os.path.join(ENGINE_DIR, "output", "emails")
INTEL_DIR = os.path.join(ENGINE_DIR, "output", "intel")

os.makedirs(SITES_DIR, exist_ok=True)
os.makedirs(EMAILS_DIR, exist_ok=True)
os.makedirs(INTEL_DIR, exist_ok=True)
