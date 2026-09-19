import sys

path = '/app/alembic/versions/40f071b2b797_admin_models_fixed.py'
with open(path, 'r') as f:
    lines = f.read().split('\n')

for i, line in enumerate(lines):
    if "'rooms', 'target_langs'" in line:
        for j in range(i, i+15):
            if "existing_nullable=False)" in lines[j]:
                lines[j] = lines[j].replace("existing_nullable=False)", "existing_nullable=False, postgresql_using='array_to_json(target_langs)::jsonb')")
                break
        break

text = '\n'.join(lines)
with open(path, 'w') as f:
    f.write(text)
print('Patched successfully via loop')
