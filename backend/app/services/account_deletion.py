"""회원 탈퇴 때 외부 저장 객체와 DB 회원 행을 같은 순서로 정리한다."""

from ..crud import user as user_crud
from ..deps import db_connection
from . import storage


class ObjectCleanupError(Exception):
    """R2 객체를 모두 지우지 못해 DB 회원 삭제를 시작하지 않았다."""


def delete_account(user_id: int) -> None:
    """사용자의 R2 객체를 먼저 지운 뒤 회원 행을 삭제한다.

    R2 삭제는 이미 없는 객체에 대해 멱등적이다. 일부 prefix를 지운 뒤 실패해도 회원 행과 user_id가
    남으므로 같은 함수를 다시 호출해 안전하게 재시도할 수 있다.
    """
    if not storage.is_configured():
        raise ObjectCleanupError("R2 설정을 확인할 수 없다")
    with db_connection() as conn:
        # 업로드도 같은 행 잠금을 잡은 뒤 R2에 쓴다. 잠금부터 R2 정리와 DB 삭제까지 한 트랜잭션으로
        # 묶으면 탈퇴가 끝난 뒤 늦은 업로드 객체가 남는 순서를 만들 수 없다.
        if user_crud.lock_user_for_update(conn, user_id) is None:
            conn.rollback()
            return
        try:
            storage.delete_user_objects(user_id)
        except storage.StorageError as exc:
            conn.rollback()
            raise ObjectCleanupError("R2 사용자 객체 삭제 실패") from exc
        user_crud.delete_user(conn, user_id)
