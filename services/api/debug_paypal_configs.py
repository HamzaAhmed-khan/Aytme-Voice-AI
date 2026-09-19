import os
from app.core.config import settings

print("--- PAYPAL SETTINGS DEBUG ---")
print(f"PAYPAL_CLIENT_ID: {settings.PAYPAL_CLIENT_ID}")
print(f"PAYPAL_SECRET: {'[SET]' if settings.PAYPAL_SECRET else '[MISSING]'}")

print("\n--- OS ENVIRON DEBUG (PAYPAL) ---")
for k, v in os.environ.items():
    if "PAYPAL" in k:
        print(f"{k}: {'[SET]' if v else '[EMPTY]'}")

# Also check for any other weirdness
print(f"\nWORKING DIR: {os.getcwd()}")
print(f"FILE LISTING: {os.listdir('.')}")
