import os
import re

versions_dir = '/app/alembic/versions'
files = [f for f in os.listdir(versions_dir) if 'admin_models' in f]

for file in files:
    path = os.path.join(versions_dir, file)
    with open(path, 'r') as f:
        content = f.read()
    
    # regex to remove the op.alter_column('rooms', 'target_langs', ...) block
    # It starts with op.alter_column('rooms', 'target_langs', and ends with existing_nullable=False)
    content = re.sub(r"op\.alter_column\('rooms', 'target_langs',.*?existing_nullable=False\)", "", content, flags=re.DOTALL)
    
    with open(path, 'w') as f:
        f.write(content)
print("Stripped target_langs alter commands successfully")
