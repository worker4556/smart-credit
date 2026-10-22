from fastapi import APIRouter

from app.api import admin, applications, auth, bank, credit, glossary

router = APIRouter()
router.include_router(admin.router)
router.include_router(auth.router)
router.include_router(applications.router)
router.include_router(bank.router)
router.include_router(credit.router)
router.include_router(glossary.router)
