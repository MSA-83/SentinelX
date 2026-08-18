// src/pages/Dashboard.tsx
// Main operational dashboard — full-featured map-centric view

import { useState, useMemo, useCallback, useEffect } from "react";
import { useOutletContext } from "react-router-dom";
import type { SentinelEntity, DomainKey, MissionWorkspace } from "@/types/entities";
import { useEntityStream } from "@/hooks/useEntityStream";
import { useLiveFeeds } from "@/hooks/useLiveFeeds";
import { useAISStream } from "@/hooks/useAISStream";
import { computeThreatAssessment } from "@/lib/threatAssessor";
import { TopBar, type MapOverlayMode } from "@/components/layout/TopBar";
import { LeftPanel } from "@/components/layout/LeftPanel";
import { RightPanel } from "@/components/layout/RightPanel";
import { MapView } from "@/components/features/MapView";
import { StatusBar } from "@/components/features/StatusBar";
import { CommandBar } from "@/components/features/CommandBar";
import { AICopilot } from "@/components/features/AICopilot";
import { ConjunctionAlertPanel } from "@/components/features/ConjunctionAlertPanel";
import { useGeofences } from "@/hooks/useGeofences";
import type { StreamEvent } from "@/types/entities";

const DEFAULT_WORKSPACES: MissionWorkspace[] = [
  {
    id: "ws-global",
    name: "GLOBAL WATCH",
    classification: "TOP_SECRET",
    activeDomains: ["aviation", "maritime", "orbital", "conflict", "seismic", "weather", "cyber", "nuclear", "sigint"],
    operator: "SX-ANALYST-7",
    createdAt: new Date().toISOString(),
    filters: { minSeverity: "LOW", anomalyOnly: false, entityTypes: [] },
  },
  {
    id: "ws-ukraine",
    name: "OPERATION EASTERN SHIELD",
    classification: "SECRET",
    activeDomains: ["aviation", "maritime", "conflict", "sigint", "cyber"],
    aoi: { name: "Eastern Ukraine / Black Sea", bounds: [44, 28, 52, 45] },
    operator: "SX-ANALYST-7",
    createdAt: new Date().toISOString(),
    filters: { minSeverity: "LOW", anomalyOnly: false, entityTypes: [] },
  },
  {
    id: "ws-indopacom",
    name: "INDOPACOM WATCH",
    classification: "TOP_SECRET",
    activeDomains: ["aviation", "maritime", "orbital", "conflict", "sigint"],
    aoi: { name: "Taiwan Strait / South China Sea", bounds: [5, 100, 35, 135] },
    operator: "SX-ANALYST-7",
    createdAt: new Date().toISOString(),
    filters: { minSeverity: "MEDIUM", anomalyOnly: false, entityTypes: [] },
  },
  {
    id: "ws-cyber",
    name: "CYBERCOM THREAT BOARD",
    classification: "TOP_SECRET",
    activeDomains: ["cyber", "sigint"],
    operator: "SX-ANALYST-7",
    createdAt: new Date().toISOString(),
    filters: { minSeverity: "HIGH", anomalyOnly: false, entityTypes: [] },
  },
];

export function Dashboard() {
  const {
    entities,
    events,
    layerStates,
    isConnected,
    latencyMs,
    messageRate,
    totalEntityCount,
    lastSync,
    acknowledgeEvent,
    toggleLayer,
  } = useEntityStream();

  const liveFeeds = useLiveFeeds();
  const aisStream  = useAISStream(true);
  const { geofences } = useGeofences();

  const outletCtx = useOutletContext<{ navCollapsed: boolean; toggleNav: () => void } | undefined>();
  const [selectedEntity,    setSelectedEntity]    = useState<SentinelEntity | null>(null);
  const [activeWorkspace,   setActiveWorkspace]   = useState<MissionWorkspace>(DEFAULT_WORKSPACES[0]);
  const [leftPanelVisible,  setLeftPanelVisible]  = useState(true);
  const [rightPanelVisible, setRightPanelVisible] = useState(true);
  const [showHotspots,      setShowHotspots]      = useState(true);
  const [showTrails,        setShowTrails]        = useState(true);
  const [overlayMode,       setOverlayMode]       = useState<MapOverlayMode>("normal");
  const [commandBarOpen,    setCommandBarOpen]    = useState(false);
  const [copilotOpen,           setCopilotOpen]           = useState(false);
  const [conjunctionPanelOpen,  setConjunctionPanelOpen]  = useState(false);

  // Extra events slot for geofence breaches (useEntityStream doesn't expose addEvent)
  const [extraEvents, setExtraEvents] = useState<StreamEvent[]>([]);

  const handleGeofenceBreachReal = useCallback((event: StreamEvent) => {
    setExtraEvents((prev) => [event, ...prev].slice(0, 40));
  }, []);

  const enabledDomains = useMemo<Set<DomainKey>>(() => {
    const enabled = new Set<DomainKey>();
    for (const [domain, state] of Object.entries(layerStates)) {
      if (state.enabled) enabled.add(domain as DomainKey);
    }
    return enabled;
  }, [layerStates]);

  // Merge mock entities with live OSINT entities (live data takes priority by ID)
  // Merge breach events into the main event stream
  const allEvents = useMemo(() => {
    const combined = [...extraEvents, ...events];
    // Deduplicate by ID
    const seen = new Set<string>();
    return combined.filter((e) => {
      if (seen.has(e.id)) return false;
      seen.add(e.id);
      return true;
    }).slice(0, 80);
  }, [events, extraEvents]);

  const mergedEntities = useMemo(() => {
    const liveById = new Map(liveFeeds.entities.map((e) => [e.id, e]));
    // Keep mock entities that aren't overridden by live data
    const mockFiltered = entities.filter((e) => !liveById.has(e.id));
    return [...mockFiltered, ...liveFeeds.entities];
  }, [entities, liveFeeds.entities]);

  const filteredEntities = useMemo(
    () => mergedEntities.filter((e) => enabledDomains.has(e.domain)),
    [mergedEntities, enabledDomains]
  );

  const threatAssessment = useMemo(
    () => computeThreatAssessment(filteredEntities),
    [filteredEntities]
  );

  const handleEntitySelect = useCallback((entity: SentinelEntity) => {
    setSelectedEntity(entity);
    setRightPanelVisible(true);
  }, []);

  const handleClearSelection = useCallback(() => {
    setSelectedEntity(null);
  }, []);

  const handleCommandBarEntitySelect = useCallback((entity: SentinelEntity) => {
    setSelectedEntity(entity);
    setRightPanelVisible(true);
    setCommandBarOpen(false);
  }, []);

  const handleWorkspaceSelect = useCallback(
    (ws: MissionWorkspace) => {
      setActiveWorkspace(ws);
      for (const [domain, state] of Object.entries(layerStates)) {
        const shouldBeEnabled = ws.activeDomains.includes(domain as DomainKey);
        if (state.enabled !== shouldBeEnabled) toggleLayer(domain as DomainKey);
      }
    },
    [layerStates, toggleLayer]
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setCommandBarOpen((v) => !v);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "i") {
        e.preventDefault();
        setCopilotOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <div className="flex flex-col w-full h-full overflow-hidden bg-sx-bg">
      <TopBar
        threatAssessment={threatAssessment}
        isConnected={isConnected}
        latencyMs={latencyMs}
        messageRate={messageRate}
        totalEntityCount={totalEntityCount}
        lastSync={lastSync}
        onToggleSidebar={() => { setLeftPanelVisible((v) => !v); outletCtx?.toggleNav?.(); }}
        onOpenCommandBar={() => setCommandBarOpen(true)}
        overlayMode={overlayMode}
        onOverlayModeChange={setOverlayMode}
        onOpenCopilot={() => setCopilotOpen((v) => !v)}
        copilotOpen={copilotOpen}
        onOpenConjunctionPanel={() => setConjunctionPanelOpen((v) => !v)}
        conjunctionPanelOpen={conjunctionPanelOpen}
        events={allEvents}
        onAcknowledgeEvent={acknowledgeEvent}
      />

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <LeftPanel
          layerStates={layerStates}
          onToggleLayer={toggleLayer}
          threatAssessment={threatAssessment}
          activeWorkspace={activeWorkspace}
          workspaces={DEFAULT_WORKSPACES}
          onSelectWorkspace={handleWorkspaceSelect}
          visible={leftPanelVisible}
        />

        <div className="flex-1 min-w-0 relative">
          <MapView
            entities={filteredEntities}
            enabledDomains={enabledDomains}
            onEntitySelect={handleEntitySelect}
            selectedEntityId={selectedEntity?.id ?? null}
            showHotspots={showHotspots}
            showTrails={showTrails}
            overlayMode={overlayMode}
            aisEntities={aisStream.entities}
            aisConnected={aisStream.connected}
            aisMessageCount={aisStream.messageCount}
            geofences={geofences}
            onGeofenceBreach={handleGeofenceBreachReal}
          />
        </div>

        <RightPanel
          events={allEvents}
          onAcknowledge={acknowledgeEvent}
          selectedEntity={selectedEntity}
          onClearSelection={handleClearSelection}
          threatAssessment={threatAssessment}
          entities={filteredEntities}
          visible={rightPanelVisible}
        />
      </div>

      <StatusBar
        layerStates={layerStates}
        lastSync={lastSync}
        isConnected={isConnected}
        showHotspots={showHotspots}
        showTrails={showTrails}
        onToggleHotspots={() => setShowHotspots((v) => !v)}
        onToggleTrails={() => setShowTrails((v) => !v)}
        liveFeedStatuses={liveFeeds.feedStatuses}
        liveFeedTotal={liveFeeds.totalLiveEntities}
        liveFeedLoading={liveFeeds.isLoading}
        liveFeedLastFetch={liveFeeds.lastFetch}
        onRefreshLiveFeeds={liveFeeds.refreshNow}
      />

      <CommandBar
        open={commandBarOpen}
        onClose={() => setCommandBarOpen(false)}
        entities={filteredEntities}
        onEntitySelect={handleCommandBarEntitySelect}
        onDomainToggle={toggleLayer}
        enabledDomains={enabledDomains}
      />

      {copilotOpen && (
        <AICopilot
          entities={filteredEntities}
          threatAssessment={threatAssessment}
          onClose={() => setCopilotOpen(false)}
        />
      )}

      {conjunctionPanelOpen && (
        <ConjunctionAlertPanel
          onClose={() => setConjunctionPanelOpen(false)}
          onCriticalAlert={handleGeofenceBreachReal}
        />
      )}
    </div>
  );
}
