'use strict';
// Owner-requested reset: remove records written on or before this cutoff.
window.NA04ReviewReset={
  cutoff:'2026-11-10T08:52:38Z',
  apply(state){
    const reviews=state.reviews.filter(r=>Date.parse(r.createdAt)>Date.parse(this.cutoff));
    return reviews.length===state.reviews.length&&state.reviewResetAt===this.cutoff?state:{...state,reviews,reviewResetAt:this.cutoff};
  }
};
