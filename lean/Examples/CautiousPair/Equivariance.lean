import Examples.CautiousPair.Model
import Simulant.Equivariance

/-! Rotation equivariance of the generated cautious-pair model, from the library lemmas
`Model.step_app` and `Model.options_app`: rotating every position (and the targets of pending
decisions) and the hole's site maps steps to steps, with the same witness. Rotations are automorphisms of the cycle that keep the
ports (`Spaces.rot_auto`), and the model's frames are port-based (`Frames.identity`). -/

namespace Examples.CautiousPair
open Simulant

variable {N : Nat} [NeZero N] {k : Nat}

/-- Rotation by `r` of the configurations of this model. -/
def rot (r : Nat) : CfgMap (sig N k) :=
  ⟨Spaces.rot r, fun w => { BlackHole := { w.BlackHole with site := Spaces.rot r w.BlackHole.site } }⟩

/-- The sensors do not see positions: they read who is at a location. -/
theorem env_rot (r : Nat) (L : Look (sig N k)) : env N k (L.app (rot r)) = env N k L := by
  have hocc := Model.occupants_app (rot (N := N) (k := k) r) (fun _ _ h => Spaces.rot_inj r h) L L.here
  simp only [env, sensor_otherStates]
  rw [show (L.app (rot r)).here = L.here from rfl, hocc, show (L.app (rot r)).me = L.me from rfl,
    show (L.app (rot r)).config = (rot r).app L.config from rfl]
  simp only [CfgMap.app, Fin.getElem_fin, Vector.getElem_map]

theorem step_rot (r : Nat) {C C' : Config (sig N k)} {w : Witness}
    (h : (model N k).Step act0 C w C') : (model N k).Step act0 ((rot r).app C) w ((rot r).app C') := by
  have hauto : (sig N k).S.Auto (rot (N := N) (k := k) r).pos := Spaces.rot_auto r
  have hports : ∀ ord, (model N k).frames ≠ .isomorphisms ord := fun _ h => by cases h
  refine Model.step_app (model N k) act0 (rot r) hauto.inj hauto.nbrs ?_
    (Model.options_app (model N k) act0 (rot r) hauto hports (env_rot r) (fun _ _ _ _ => rfl)) ?_ ?_ ?_ ?_ ?_ ?_ ?_ h
  · -- The cycle is static, and rotations preserve adjacency.
    intro ts hts p q
    simp only [model, List.mem_singleton] at hts
    subst hts
    exact hauto.edgePresent_nil p q
  · intro c hc ts C; simp only [model, List.mem_singleton] at hc; subst hc; rfl
  · intro c hc ts C ds; simp only [model, List.mem_singleton] at hc; subst hc; rfl
  · intro c hc ts C ds; simp only [model, List.mem_singleton] at hc; subst hc; rfl
  · intro c hc ts C; simp only [model, List.mem_singleton] at hc; subst hc
    have ha' : ∀ (i : Nat) (h : i < k), ((rot (N := N) (k := k) r).app C).agents[i] =
        { C.agents[i] with pos := Spaces.rot r C.agents[i].pos, pending := C.agents[i].pending.map (rot r).dec } :=
      fun i h => CfgMap.app_agent' (σ := sig N k) _ _ i h
    have hsite : ((rot (N := N) (k := k) r).world C.world).BlackHole.site = Spaces.rot r C.world.BlackHole.site := rfl
    have hact : ((rot (N := N) (k := k) r).world C.world).BlackHole.active = C.world.BlackHole.active := rfl
    simp [Library.BlackHole.component, Library.BlackHole.hooks, Hooks.toComponent, ctx_BlackHole, ha',
      hsite, hact, Spaces.rot_eq_rot]
  · -- FSYNC reads only which agents are eligible, which rotations do not change.
    intro ts C
    simp only [model, Library.FSync.scheduler, SchedulerHooks.toScheduler, Library.FSync.hooks, Model.eligible_app]
  · intro c hc ts C ds e he; simp only [model, List.mem_singleton] at hc; subst hc
    rcases he with he | he | he | he <;> obtain ⟨e', he', rfl⟩ := ND.can_map.1 he
    · rw [ND.can_pure.1 he']; intro w; rfl
    · rw [ND.can_pure.1 he']; intro w; rfl
    · rw [ND.can_pure.1 he']; intro w; rfl
    · obtain ⟨_, -, rfl⟩ := ND.can_map.1 he'; intro w; rfl
  · -- FSYNC owns no part of the world.
    intro ts C s hs
    obtain ⟨s', hs', rfl⟩ := ND.can_map.1 hs
    rw [ND.can_pure.1 hs']; intro w; rfl

end Examples.CautiousPair
