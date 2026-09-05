#!/usr/bin/env bash
# One-time pull of existing product screenshots/clips from the public AiVRIC-Website repo into media/.
# Safe to re-run; skips files that already exist. Requires curl.
set -euo pipefail
cd "$(dirname "$0")/.."
RAW="https://raw.githubusercontent.com/AiVRIC/AiVRIC-Website/gh-pages"
get() { # get <repo-path> <local-path>
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
get $A/clip-findings-triage.webm  media/cloudsignals/clip-findings-triage.webm
get $V/CS-Session-1.mp4           media/cloudsignals/cs-session-1.mp4
get $BR/Main-Screen-Promo.png     media/cloudsignals/cs-session-1-poster.png
# AI Signals
get $A/grc-ai-settings.png        media/ai-signals/grc-ai-settings.png
get $BR/Threat-Signals-1.png      media/rogueagent/exposure-map-concept.png
# AIRE
get $A/clip-treatments.webm       media/aire/clip-treatments.webm
get $A/projects-sla.png           media/aire/projects-sla.png
get $A/projects-main.png          media/aire/projects-main.png
get $A/pending-decisions.png      media/aire/pending-decisions.png
# Vision
get $APP/VISION-Chat-Entry.jpg    media/vision-ai-optics/vision-chat-entry.jpg
get $APP/VISION-Chat-QandA.jpg    media/vision-ai-optics/vision-chat-qanda.jpg
get $APP/Findings-dashboard-RiskPlot.jpg media/vision-ai-optics/findings-risk-plot.jpg
get $A/provider-clients-list.png  media/vision-enterprise/provider-clients-list.png
get $A/provider-branding-config.png media/vision-enterprise/provider-branding-config.png
get $A/integration-hub.png        media/fabric-center/integration-hub.png
# Executive decisions
get $A/projects-exceptions.png    media/decisions/projects-exceptions.png
# Fabric floor
get $A/integration-hub.png        media/fabric/integration-hub.png
echo done
