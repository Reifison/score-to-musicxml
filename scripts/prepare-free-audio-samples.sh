#!/usr/bin/env bash
set -euo pipefail

# Creates the small, locally bundled banks used by the web player. Sources are
# intentionally explicit so the provenance of every shipped sound is auditable.
project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
output_root="$project_root/apps/web/public/audio/samples"
staging_dir="$(mktemp -d)"
trap 'rm -rf "$staging_dir"' EXIT

mkdir -p "$output_root/piano" "$output_root/guitar"

convert_sample() {
  local source_url="$1"
  local destination="$2"
  local source_file="$staging_dir/source-${RANDOM}"
  curl --fail --location --silent --show-error "$source_url" --output "$source_file"
  ffmpeg -nostdin -hide_banner -loglevel error -y -i "$source_file" \
    -af "loudnorm=I=-20:TP=-1.5:LRA=7:linear=true" \
    -ac 1 -ar 44100 -c:a aac -profile:a aac_low -b:a 96k \
    -movflags +faststart -avoid_negative_ts make_zero "$destination"
}

# Salamander Grand Piano V3 — Alexander Holm — CC BY 3.0.
piano_points=(A0 D#1 A1 D#2 A2 D#3 A3 D#4 A4 D#5 A5 D#6 A6 D#7 A7 C8)
for point in "${piano_points[@]}"; do
  encoded_point="${point/\#/%23}"
  file_stem="$(printf '%s' "$point" | tr '[:upper:]' '[:lower:]' | tr '#' 's')"
  convert_sample "https://raw.githubusercontent.com/sfzinstruments/SalamanderGrandPiano/master/Samples/${encoded_point}v4.flac" "$output_root/piano/${file_stem}-soft.m4a"
  convert_sample "https://raw.githubusercontent.com/sfzinstruments/SalamanderGrandPiano/master/Samples/${encoded_point}v12.flac" "$output_root/piano/${file_stem}-loud.m4a"
done

# Shinyguitar — Karoryfer Lecolds — CC0 1.0. The MIDI keys are read from the
# upstream acoustic.sfz mapping; rr1 provides a deterministic compact bank.
guitar_points=(db2 e2 gb2 a2 c3 eb3 gb3 a3 eb4 gb4 a4 c5 eb5 gb5 a5 c6)
for point in "${guitar_points[@]}"; do
  convert_sample "https://raw.githubusercontent.com/sfzinstruments/karoryfer.shinyguitar/master/Samples/acoustic/${point}_vl1_rr1_1.wav" "$output_root/guitar/${point}-soft.m4a"
  convert_sample "https://raw.githubusercontent.com/sfzinstruments/karoryfer.shinyguitar/master/Samples/acoustic/${point}_vl4_rr1_1.wav" "$output_root/guitar/${point}-loud.m4a"
done

printf 'Prepared free local sample banks in %s\n' "$output_root"
