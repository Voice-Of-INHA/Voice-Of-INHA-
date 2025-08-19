from pydantic import BaseModel

class PageMeta(BaseModel):
    page: int
    size: int
    total: int
    hasNext: bool
