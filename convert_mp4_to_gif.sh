#!/bin/bash

# Array of file paths
files=(
    "/home/elias/Remove Newlines From Selection Demo.mp4"
    "/home/elias/Remove Blank Lines From Selection.mp4"
    "/home/elias/Paste Without Newlines Demo.mp4"
    "/home/elias/Paste Without Blank Lines.mp4"
)

# Loop through each file and convert to GIF
for file in "${files[@]}"; do
    output="${file%.mp4}.gif"
    ffmpeg -i "$file" -lavfi "[0]split[a][b];[a]palettegen[p];[b]fifo[v];[v][p]paletteuse,format=pal8" -loop 0 "$output"
done

