import os

class Helpers:
    def __init__(self):
        pass

    def ensure_file_exists(self, path: str):
        # Ensure parent directories exist
        dir_name = os.path.dirname(path)
        if dir_name and not os.path.exists(dir_name):
            os.makedirs(dir_name)

        # Ensure the file exists
        if not os.path.exists(path):
            with open(path, 'w') as f:
                pass  # Create an empty file


if __name__ == "__main__":
    helper = Helpers()
    helper.ensure_file_exists("static/notes/testdir/manual.md")