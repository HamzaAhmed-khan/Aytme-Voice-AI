import os

base = r"d:\UNIVER\WORK\PHASE 1 aytme\aytme\clients\web\src\v2"

fpath = os.path.join(base, "Login.jsx")
with open(fpath, "rb") as f:
    raw = f.read()

content = raw.decode("utf-8")
le = "\r\n" if "\r\n" in content else "\n"
print(f"Line ending: {'CRLF' if le == chr(13)+chr(10) else 'LF'}")
print(f"Total chars: {len(content)}")

# Search for the marker
marker = "{/* Resend + Back */}"
idx = content.find(marker)
print(f"Marker found at char index: {idx}")

if idx >= 0:
    # Show context
    print("Context before marker:")
    print(repr(content[max(0,idx-80):idx]))
    
    # Build the skip button
    skip = le.join([
        "",
        "  {/* Skip OTP (temporary - until email service is configured) */}",
        "  <button",
        "    onClick={() => {",
        "      toast.success('Welcome to Aytme V2');",
        "      if (onLogin) onLogin(returnTo);",
        "      else navigate(returnTo);",
        "    }}",
        '    className="w-full text-center text-v2-muted text-sm font-medium hover:text-v2-accent transition-colors py-2 mb-2"',
        "  >",
        "    Skip for now &rarr;",
        "  </button>",
        "",
    ])
    
    # Insert before the marker
    new_content = content[:idx] + skip + content[idx:]
    
    with open(fpath, "wb") as f:
        f.write(new_content.encode("utf-8"))
    
    print("SUCCESS: Skip button added to Login.jsx")
else:
    print("FAILED: marker not found")
