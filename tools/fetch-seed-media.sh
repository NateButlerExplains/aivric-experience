#!/usr/bin/env bash
# One-time pull of existing product screenshots/clips from the public AiVRIC-Website repo into media/.
# Safe to re-run; skips files that already exist. Requires curl.
#
# QUARANTINE: some upstream assets contain leaked or test data and must never land in this repo.
# They are listed in BLOCKED below and are refused even if a get() line is (re)added by mistake.
# See the "Why" notes next to each entry. If you need to re-derive one of the locally edited
# assets, pull the upstream file to a scratch path by hand and redo the crop/trim/redaction.
set -euo pipefail
cd "$(dirname "$0")/.."
RAW="https://raw.githubusercontent.com/AiVRIC/AiVRIC-Website/gh-pages"

# Destinations that must never be written by this script.
BLOCKED="
media/vision-enterprise/provider-branding-config.png
media/decisions/projects-exceptions.png
media/aire/pending-decisions.png
media/aire/clip-treatments.webm
media/cloudsignals/clip-findings-triage.webm
"
# Why each is blocked:
#   provider-branding-config.png  deleted   personal support email, 3hue.net logo URLs, 3HUE sidebar branding
#   projects-exceptions.png       deleted   "Test exception" row, "Test Company Names", tooltip covering the table
#   pending-decisions.png         edited    upstream has "Another Test" / "Test trhreat stemevr" rows; ours is cropped
#   clip-treatments.webm          edited    upstream opens on sign-in + MFA and ends on the test rows; ours is trimmed
#   clip-findings-triage.webm     edited    upstream opens on sign-in + MFA and shows an unmasked AWS account id;
#                                           ours is trimmed and the account id is blurred

is_blocked() { printf '%s\n' "$BLOCKED" | grep -qxF "$1"; }

get() { # get <repo-path> <local-path>
  if is_blocked "$2"; then echo "BLOCK $2  (quarantined: see header)"; return; fi
  if [ -s "$2" ]; then echo "skip  $2"; return; fi
  mkdir -p "$(dirname "$2")"
  if curl -fsSL --retry 2 -o "$2" "$RAW/$1"; then echo "ok    $2"; else echo "MISS  $1"; rm -f "$2"; fi
}
A="academy/screenshots"; APP="assets/images/app"; BR="assets/images/brand"; V="assets/videos"
# CloudSignals+RiskOps
get $A/overview-dashboard.png     media/cloudsignals/overview-dashboard.png
get $A/findings-list.png          media/cloudsignals/findings-list.png
get $A/finding-detail.png         media/cloudsignals/finding-detail.png
get $A/compliance-overview.png    media/cloudsignals/compliance-overview.png
get $A/portfolio-exposure.png     media/cloudsignals/portfolio-exposure.png
get $V/CS-Session-1.mp4           media/cloudsignals/cs-session-1.mp4
# cs-session-1-poster.jpg is committed to the repo; it is not fetched (the old line pulled
# Main-Screen-Promo.png to a .png path nothing references, leaving a stray file on every run).
# AI Signals
get $A/grc-ai-settings.png        media/ai-signals/grc-ai-settings.png
get $BR/Threat-Signals-1.png      media/rogueagent/exposure-map-concept.png
# AIRE
get $A/projects-sla.png           media/aire/projects-sla.png
get $A/projects-main.png          media/aire/projects-main.png
# Vision
get $APP/VISION-Chat-Entry.jpg    media/vision-ai-optics/vision-chat-entry.jpg
get $APP/VISION-Chat-QandA.jpg    media/vision-ai-optics/vision-chat-qanda.jpg
get $APP/Findings-dashboard-RiskPlot.jpg media/vision-ai-optics/findings-risk-plot.jpg
get $A/provider-clients-list.png  media/vision-enterprise/provider-clients-list.png
get $A/integration-hub.png        media/fabric-center/integration-hub.png
# Fabric floor
get $A/integration-hub.png        media/fabric/integration-hub.png
# Clip posters (media/*/clip-*-poster.jpg) are extracted locally from the trimmed clips with
# ffmpeg; they are not upstream assets and are not fetched here.
echo done
