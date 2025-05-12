#!/usr/bin/env bash
#
# export_code.sh
# 
# Recursively finds all .ts files in src/ and concatenates them into all_src.txt.
# Usage:
#   chmod +x export_code.sh
#   ./export_code.sh

TARGET_FILE="all_src.txt"

echo "Collecting all .ts files from src/ into $TARGET_FILE ..."
# Remove existing file (if any), then recreate it empty
rm -f "$TARGET_FILE"
touch "$TARGET_FILE"

# Find all .ts files in src/ and append them to $TARGET_FILE
find src -type f -name '*.ts' | while read -r FILE_PATH; do
  echo "===== FILE: $FILE_PATH =====" >> "$TARGET_FILE"
  cat "$FILE_PATH" >> "$TARGET_FILE"
  echo -e "\n" >> "$TARGET_FILE"
done

echo "Done! All code appended to $TARGET_FILE"
