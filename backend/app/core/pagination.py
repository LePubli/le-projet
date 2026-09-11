from typing import Optional
from sqlalchemy.orm import Query


def paginate(
    query: Query,
    skip: int = 0,
    limit: int = 100,
    page: Optional[int] = None,
    page_size: Optional[int] = None,
    order_by=None,
):
    """Pagine une requête SQLAlchemy.

    Deux modes d'usage:
    - skip/limit (legacy) : retourne juste la liste
    - page/page_size (recommandé) : retourne {items, total, page, page_size, total_pages}
    """
    if order_by is not None:
        query = query.order_by(order_by)

    if page is not None or page_size is not None:
        ps = min(int(page_size or 50), 200)
        p = max(int(page or 1), 1)
        total = query.count()
        items = query.offset((p - 1) * ps).limit(ps).all()
        return {
            "items": items,
            "total": total,
            "page": p,
            "page_size": ps,
            "total_pages": (total + ps - 1) // ps,
        }

    return query.offset(skip).limit(limit).all()
