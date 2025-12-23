import os

root_dir = "/Users/aldinademovic/Downloads/Px-PnL/src/apps/perps"

for root, dirs, files in os.walk(root_dir):
    for file in files:
        if file.endswith((".ts", ".tsx", ".js", ".jsx")):
            file_path = os.path.join(root, file)
            with open(file_path, "r") as f:
                content = f.read()
            
            # Calculate depth relative to root_dir
            rel_path = os.path.relpath(root, root_dir)
            if rel_path == ".":
                depth = 0
            else:
                depth = rel_path.count(os.sep) + 1
            
            prefix = "../" * depth
            if depth == 0:
                prefix = "./"
            
            new_content = content.replace("from '@/", f"from '{prefix}")
            new_content = new_content.replace('from "@/', f'from "{prefix}')
            new_content = new_content.replace("import('@/", f"import('{prefix}")
            new_content = new_content.replace('import("@/', f'import("{prefix}')
            
            if content != new_content:
                with open(file_path, "w") as f:
                    f.write(new_content)
                print(f"Updated imports in {file_path}")
