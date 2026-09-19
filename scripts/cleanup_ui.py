import os
import re

V2_DIR = r"d:\Upwork\rahman-azeez\fast-api\clients\web\src\v2"

replacements = {
    r'\brounded-3xl\b': 'rounded-lg',
    r'\brounded-2xl\b': 'rounded-md',
    r'\brounded-xl\b': 'rounded-md',
    r'\bitalic\b': '',
    r'\bfont-black\b': 'font-semibold',
    r'  +': ' ' # Clean up multiple spaces left by replacing italic
}

def process_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    original = content
    for pattern, repl in replacements.items():
        content = re.sub(pattern, repl, content)
    
    # Fix instances where classNames might get a leading space " className=' '"
    content = content.replace('className=" ', 'className="')

    if content != original:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Updated: {os.path.basename(filepath)}")

def main():
    for root, dirs, files in os.walk(V2_DIR):
        for file in files:
            if file.endswith('.jsx'):
                process_file(os.path.join(root, file))
    
    print("UI Cleanup complete.")

if __name__ == "__main__":
    main()
