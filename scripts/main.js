const MODULE_ID = 'token-hover-range';

const SETTINGS = {
   enabled: 'enabled',
   mode: 'mode',
   elevation: 'elevation',
   gmOrigin: 'gmOrigin'
};

/** The hovered token currently showing a label, and its label. */
let hovered = null;
let label = null;
let refreshQueued = false;

/* -------------------------------------------- */
/*  Setup                                       */
/* -------------------------------------------- */

Hooks.once('init', () =>
{
   const i18n = (key) => `TokenHoverRange.Settings.${key}`;

   game.settings.register(MODULE_ID, SETTINGS.enabled, {
      name: i18n('Enabled.Name'),
      hint: i18n('Enabled.Hint'),
      scope: 'client',
      config: true,
      type: Boolean,
      default: true,
      onChange: () => clearLabel()
   });

   game.settings.register(MODULE_ID, SETTINGS.mode, {
      name: i18n('Mode.Name'),
      hint: i18n('Mode.Hint'),
      scope: 'client',
      config: true,
      type: String,
      default: 'edge',
      choices: { edge: i18n('Mode.Edge'), center: i18n('Mode.Center') },
      onChange: () => queueRefresh()
   });

   game.settings.register(MODULE_ID, SETTINGS.elevation, {
      name: i18n('Elevation.Name'),
      hint: i18n('Elevation.Hint'),
      scope: 'client',
      config: true,
      type: Boolean,
      default: true,
      onChange: () => queueRefresh()
   });

   game.settings.register(MODULE_ID, SETTINGS.gmOrigin, {
      name: i18n('GMOrigin.Name'),
      hint: i18n('GMOrigin.Hint'),
      scope: 'client',
      config: true,
      type: String,
      default: 'party',
      choices: { controlled: i18n('GMOrigin.Controlled'), party: i18n('GMOrigin.Party') },
      onChange: () => queueRefresh()
   });

   game.keybindings.register(MODULE_ID, 'toggle', {
      name: 'TokenHoverRange.Keybindings.Toggle.Name',
      hint: 'TokenHoverRange.Keybindings.Toggle.Hint',
      editable: [],
      onDown: () =>
      {
         const enabled = !game.settings.get(MODULE_ID, SETTINGS.enabled);
         game.settings.set(MODULE_ID, SETTINGS.enabled, enabled);
         ui.notifications.info(`TokenHoverRange.Notifications.${enabled ? 'On' : 'Off'}`, { localize: true });
         return true;
      }
   });
});

/* -------------------------------------------- */
/*  Hooks                                       */
/* -------------------------------------------- */

Hooks.on('hoverToken', (token, isHovered) =>
{
   if (isHovered)
   {
      hovered = token;
      showLabel();
   }
   else if (token === hovered)
   {
      clearLabel();
   }
});

// Keep the label current if either token moves or the selection changes while hovering.
Hooks.on('refreshToken', () => { if (hovered) { queueRefresh(); } });
Hooks.on('controlToken', () => { if (hovered) { queueRefresh(); } });
Hooks.on('deleteToken', (doc) => { if (hovered?.document === doc) { clearLabel(); } });
Hooks.on('canvasTearDown', () => clearLabel());

/* -------------------------------------------- */
/*  Label                                       */
/* -------------------------------------------- */

function queueRefresh()
{
   if (refreshQueued) { return; }
   refreshQueued = true;
   requestAnimationFrame(() =>
   {
      refreshQueued = false;
      if (hovered) { showLabel(); }
   });
}

function clearLabel()
{
   if (label && !label.destroyed) { label.destroy(); }
   label = null;
   hovered = null;
}

function showLabel()
{
   const target = hovered;

   if (label && !label.destroyed) { label.destroy(); }
   label = null;

   if (!target || target.destroyed || !canvas?.ready) { return; }
   if (!game.settings.get(MODULE_ID, SETTINGS.enabled)) { return; }

   const origin = findOrigin(target);
   if (!origin) { return; }

   const distance = measureTokens(origin.token, target);
   if (!Number.isFinite(distance)) { return; }

   const units = canvas.scene?.grid?.units ?? canvas.grid?.units ?? '';
   const rounded = Math.round(distance * 10) / 10;
   let text = `${rounded.toLocaleString()}${units ? ` ${units}` : ''}`;
   if (origin.showName) { text += `\n${origin.token.document.name}`; }

   label = createText(text);
   label.anchor.set(0.5, 1);

   // Sit above the token, and above the elevation tooltip if that is showing.
   let offset = 4;
   if (target.tooltip?.visible && target.tooltip?.text) { offset += target.tooltip.height; }
   label.position.set(target.w / 2, -offset);

   target.addChild(label);
}

function createText(content)
{
   const style = CONFIG.canvasTextStyle.clone();
   style.fontSize = Math.max(16, Math.round((canvas.dimensions?.size ?? 100) * 0.24));
   style.align = 'center';

   const TextClass = foundry.canvas?.containers?.PreciseText ?? PIXI.Text;
   const text = new TextClass(content, style);
   text.eventMode = 'none';
   return text;
}

/* -------------------------------------------- */
/*  Choosing which token to measure from        */
/* -------------------------------------------- */

/**
 * @param {Token} target - The hovered token.
 *
 * @returns {{ token: Token, showName: boolean } | null} The token to measure from.
 */
function findOrigin(target)
{
   const candidates = (tokens) => tokens.filter((t) => t !== target && !t.destroyed && t.document);

   // 1. Selected tokens always win.
   const controlled = candidates(canvas.tokens.controlled);
   if (controlled.length) { return { token: nearest(controlled, target), showName: controlled.length > 1 }; }

   if (game.user.isGM)
   {
      if (game.settings.get(MODULE_ID, SETTINGS.gmOrigin) !== 'party') { return null; }

      // 2a. GM: nearest token belonging to a player character.
      const party = candidates(canvas.tokens.placeables.filter((t) => t.actor?.hasPlayerOwner));
      return party.length ? { token: nearest(party, target), showName: true } : null;
   }

   // 2b. Player: their assigned character's token on this scene.
   const character = game.user.character;
   if (character)
   {
      const own = candidates(canvas.tokens.placeables.filter((t) => t.actor?.id === character.id));
      if (own.length) { return { token: nearest(own, target), showName: false }; }
   }

   // 3. Player: any token they own on this scene.
   const owned = candidates(canvas.tokens.placeables.filter((t) => t.document.isOwner));
   return owned.length ? { token: nearest(owned, target), showName: owned.length > 1 } : null;
}

function nearest(tokens, target)
{
   if (tokens.length === 1) { return tokens[0]; }

   let best = tokens[0];
   let bestDistance = Infinity;
   for (const token of tokens)
   {
      const d = measureTokens(token, target);
      if (d < bestDistance) { bestDistance = d; best = token; }
   }
   return best;
}

/* -------------------------------------------- */
/*  Measuring                                   */
/* -------------------------------------------- */

/**
 * Measures the distance between two tokens in scene units, using the scene's grid rules (including diagonals).
 *
 * @param {Token} a - First token.
 *
 * @param {Token} b - Second token.
 *
 * @returns {number} Distance in grid units.
 */
function measureTokens(a, b)
{
   const grid = canvas.grid;
   const useElevation = game.settings.get(MODULE_ID, SETTINGS.elevation);
   const mode = game.settings.get(MODULE_ID, SETTINGS.mode);

   const flatten = (point) => (useElevation ? point : { ...point, elevation: 0 });

   // Nearest occupied spaces. Not available on gridless scenes, which fall back to centers.
   if (mode === 'edge' && !grid.isGridless)
   {
      const pointsA = occupiedCenters(a).map(flatten);
      const pointsB = occupiedCenters(b).map(flatten);

      if (pointsA.length && pointsB.length)
      {
         let best = Infinity;
         for (const pa of pointsA)
         {
            for (const pb of pointsB)
            {
               const d = grid.measurePath([pa, pb]).distance;
               if (d < best) { best = d; }
            }
         }
         return best;
      }
   }

   return grid.measurePath([flatten(centerOf(a)), flatten(centerOf(b))]).distance;
}

function occupiedCenters(token)
{
   try
   {
      return token.document.getOccupiedGridSpaceOffsets().map((offset) => canvas.grid.getCenterPoint(offset));
   }
   catch (err)
   {
      return [];
   }
}

function centerOf(token)
{
   const center = token.document.getCenterPoint?.() ?? token.center;
   return { x: center.x, y: center.y, elevation: center.elevation ?? token.document.elevation ?? 0 };
}
