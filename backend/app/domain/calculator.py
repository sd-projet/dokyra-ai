"""Évaluateur arithmétique sûr (outil « calculer » de l'agent). Basé sur ast : pas d'eval()."""
from __future__ import annotations

import ast
import math
import re
import operator as op

from .errors import ValidationFailed

_BIN = {ast.Add: op.add, ast.Sub: op.sub, ast.Mult: op.mul, ast.Div: op.truediv,
        ast.FloorDiv: op.floordiv, ast.Mod: op.mod, ast.Pow: op.pow}
_UNARY = {ast.UAdd: op.pos, ast.USub: op.neg}
_FUNCS = {"abs": abs, "round": round, "min": min, "max": max, "sqrt": math.sqrt,
          "ceil": math.ceil, "floor": math.floor}
_MAX_ABS = 10 ** 15


def _eval(node):
    if isinstance(node, ast.Expression):
        return _eval(node.body)
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)) \
            and not isinstance(node.value, bool):
        return node.value
    if isinstance(node, ast.BinOp) and type(node.op) in _BIN:
        left, right = _eval(node.left), _eval(node.right)
        if isinstance(node.op, ast.Pow) and abs(right) > 100:
            raise ValidationFailed("Exposant trop grand.")
        return _BIN[type(node.op)](left, right)
    if isinstance(node, ast.UnaryOp) and type(node.op) in _UNARY:
        return _UNARY[type(node.op)](_eval(node.operand))
    if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) \
            and node.func.id in _FUNCS and not node.keywords:
        return _FUNCS[node.func.id](*[_eval(a) for a in node.args])
    raise ValidationFailed("Expression non autorisée (opérations + - * / // % ** et fonctions "
                           f"{', '.join(sorted(_FUNCS))} uniquement).")


def calculate(expression: str) -> str:
    expr = expression.strip().replace("×", "*").replace("÷", "/").replace("^", "**")
    if not re.search(r"[a-z]", expr, re.I):  # « 1,5 » = décimale française, sauf dans max(2, 9)
        expr = expr.replace(",", ".")
    if not expr or len(expr) > 200:
        raise ValidationFailed("Expression vide ou trop longue.")
    try:
        value = _eval(ast.parse(expr, mode="eval"))
    except ZeroDivisionError:
        raise ValidationFailed("Division par zéro.")
    except (SyntaxError, TypeError, ValueError, OverflowError):
        raise ValidationFailed("Expression invalide.")
    if isinstance(value, float):
        if math.isnan(value) or math.isinf(value) or abs(value) > _MAX_ABS:
            raise ValidationFailed("Résultat hors limites.")
        value = round(value, 10)
        if value == int(value):
            value = int(value)
    elif abs(value) > _MAX_ABS:
        raise ValidationFailed("Résultat hors limites.")
    return str(value)
