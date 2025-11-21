use crate::models::{AuthRequest, RequestId};
use parking_lot::RwLock;
use std::collections::HashMap;

#[derive(Default, Clone)]
pub struct AuthStore {
    inner: std::sync::Arc<RwLock<HashMap<RequestId, AuthRequest>>>,
}

impl AuthStore {
    pub fn insert(&self, req: AuthRequest) {
        self.inner.write().insert(req.id, req);
    }

    pub fn update(&self, req: AuthRequest) {
        self.inner.write().insert(req.id, req);
    }

    pub fn get(&self, id: &RequestId) -> Option<AuthRequest> {
        self.inner.read().get(id).cloned()
    }
}
